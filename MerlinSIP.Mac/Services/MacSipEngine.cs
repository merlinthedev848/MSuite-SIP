using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.RegularExpressions;
using SIPSorcery.Media;
using SIPSorcery.Net;
using SIPSorcery.SIP;
using SIPSorcery.SIP.App;
using SIPSorceryMedia.Abstractions;

namespace MerlinSip.Mac;

public sealed class MacSipEngine : IDisposable
{
    private readonly object _gate = new();
    private readonly DeskStore _store;
    private readonly MediaHub _hub = new();
    private readonly CallSlot _line1;
    private readonly CallSlot _line2;
    private SIPTransport? _transport;
    private SIPRegistrationUserAgent? _registration;
    private Timer? _heartbeat;
    private Timer? _subscribe;
    private string _claimedCallId = "";
    private bool _started;
    private bool _conferencePending;
    private int _cseq = 1;
    private readonly SemaphoreSlim _publishLock = new(1, 1);
    private readonly Dictionary<string, BlfChannels> _blf = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _subscriptionTargets = new(StringComparer.OrdinalIgnoreCase);
    private string _publishedPresence = "";
    private string _publishCallId = "";
    private string _publishTag = "";
    private string _publishEtag = "";
    private int _publishCseq = 1;
    private string _notifyCallId = "";
    private string _notifyTag = "";
    private int _notifyCseq = 1;
    private double _measuredLatencyMs;

    public MacSipEngine(DeskStore store)
    {
        _store = store;
        _publishedPresence = store.Config.Presence;
        _line1 = new CallSlot(1);
        _line2 = new CallSlot(2);
    }

    public MediaHub Hub => _hub;
    public int Revision { get; private set; }
    public int ListRevision { get; private set; }
    public string StatusText { get; private set; } = "Offline";
    public string DetailText { get; private set; } = "Enter your SIP account to register.";
    public string Banner { get; private set; } = "";
    public int VoicemailWaiting { get; private set; }
    public bool IsRegistered => _registration?.IsRegistered == true;
    public bool ConferenceActive { get; private set; }

    public string Presence => _store.Config.Presence;
    public bool DoNotDisturb => _store.Config.DoNotDisturb || Presence == "DND";
    public bool AutoAnswer => _store.Config.AutoAnswer;

    public void Start()
    {
        if (_started)
        {
            return;
        }

        _started = true;
        ApplyAudioSettings();
        _hub.Start();
        if (!string.IsNullOrWhiteSpace(_store.Config.Extension))
        {
            OpenRegistration();
        }
        else
        {
            SetStatus("Offline", "Enter your SIP account to register.");
        }
    }

    public void ApplyAudioSettings()
    {
        var config = _store.Config;
        _hub.MicVolume = (float)Math.Clamp(config.MicrophoneVolume, 0, 1);
        _hub.SpeakerVolume = (float)Math.Clamp(config.SpeakerVolume, 0, 1);
        _hub.InputDeviceId = config.AudioInputId;
        _hub.OutputDeviceId = config.AudioOutputId;
        _hub.Ringtone = config.Ringtone;
        if (_started)
        {
            _hub.RestartDevices();
        }

        Touch();
    }

    public void TouchLists()
    {
        ListRevision++;
        Touch();
    }

    public void RegisterFromConfig()
    {
        _store.Config.ApplyFixedEndpoint();
        _store.SaveConfig();
        ApplyAudioSettings();
        OpenRegistration();
    }

    public void Unregister()
    {
        TearDown();
        SetStatus("Offline", "Signed out.");
    }

    public Task SetPresenceAsync(string presence)
    {
        var wasDnd = DoNotDisturb;
        _store.Config.Presence = presence;
        _store.Config.DoNotDisturb = presence == "DND";
        _store.SaveConfig();
        Touch();
        if (presence == "Offline")
        {
            Unregister();
            return Task.CompletedTask;
        }

        if (!IsRegistered)
        {
            OpenRegistration();
        }

        return ApplyPresenceAsync(presence, wasDnd);
    }

    public Task SetDoNotDisturbAsync(bool enabled)
    {
        var wasDnd = DoNotDisturb;
        _store.Config.DoNotDisturb = enabled;
        if (enabled)
        {
            _store.Config.Presence = "DND";
        }
        else if (_store.Config.Presence == "DND")
        {
            _store.Config.Presence = "Available";
        }

        _store.SaveConfig();
        Touch();
        if (!IsRegistered && _store.Config.Presence != "Offline")
        {
            OpenRegistration();
        }

        return ApplyPresenceAsync(_store.Config.Presence, wasDnd);
    }

    public void SetAutoAnswer(bool enabled)
    {
        _store.Config.AutoAnswer = enabled;
        _store.SaveConfig();
        Touch();
    }

    public void Dial(int preferredLine, string number, bool video = false)
    {
        number = Normalize(number);
        if (number.Length == 0)
        {
            Banner = "Enter a number to dial.";
            Touch();
            return;
        }

        var line = IdleLine(preferredLine);
        if (line == null)
        {
            Banner = "Both lines are in use.";
            Touch();
            return;
        }

        _ = DialCore(line, number, video);
    }

    public void Answer(int lineId) => _ = AnswerCore(Slot(lineId));

    public void Decline(int lineId) => DeclineCore(Slot(lineId));

    public void Hangup(int lineId)
    {
        var line = Slot(lineId);
        try
        {
            if (line.Phase == "Outgoing")
            {
                line.Agent?.Cancel();
            }
            else
            {
                line.Agent?.Hangup();
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("Hangup failed: " + ex.Message);
        }

        if (line.Phase == "Incoming")
        {
            DeclineCore(line);
            return;
        }

        Finish(line, line.Phase == "InCall" ? "Answered" : "Cancelled");
    }

    public void SetMuted(int lineId, bool muted)
    {
        var line = Slot(lineId);
        line.Muted = muted;
        if (line.Audio != null)
        {
            line.Audio.Muted = muted;
        }

        Touch();
    }

    public void SetHeld(int lineId, bool held)
    {
        var line = Slot(lineId);
        if (line.Agent == null || line.Phase != "InCall")
        {
            return;
        }

        try
        {
            if (held)
            {
                line.Agent.PutOnHold();
            }
            else
            {
                line.Agent.TakeOffHold();
                _hub.FocusLine = lineId;
            }

            line.Held = held;
            _hub.SetLineAudible(lineId, !held);
            Touch();
        }
        catch (Exception ex)
        {
            Banner = ex.Message;
            Touch();
        }
    }

    public void ToggleRecord(int lineId)
    {
        var line = Slot(lineId);
        if (line.Phase != "InCall")
        {
            return;
        }

        line.Recording = !line.Recording;
        if (line.Recording)
        {
            var path = Path.Combine(_store.RecordingsPath, $"call-{DateTime.Now:yyyyMMdd-HHmmss}-line{lineId}.wav");
            _hub.StartRecording(path);
            line.RecordingPath = path;
        }
        else if (!AnyRecording())
        {
            _hub.StopRecording();
        }

        var recordCode = string.IsNullOrWhiteSpace(_store.Config.RecordingCode)
            ? DeskPhone.OneTouchRecord
            : _store.Config.RecordingCode.Trim();
        _ = SendRecordCodeAsync(line, recordCode, line.Recording);
        Touch();
    }

    public void DialVoicemail()
    {
        if (!RequireIdle("Voicemail is used when the phone is idle."))
        {
            return;
        }

        var code = string.IsNullOrWhiteSpace(_store.Config.VoicemailNumber)
            ? DeskPhone.Voicemail
            : _store.Config.VoicemailNumber.Trim();
        Dial(1, code);
    }

    public void DialGroupPickup()
    {
        if (_line1.Phase == "InCall" || _line2.Phase == "InCall")
        {
            Banner = "Group pickup is used when the phone is idle.";
            Touch();
            return;
        }

        var code = string.IsNullOrWhiteSpace(_store.Config.PickupCode)
            ? DeskPhone.GroupPickup
            : _store.Config.PickupCode.Trim();
        Dial(1, code);
    }

    public void DialIntercom(string? destination)
    {
        if (!RequireIdle("Intercom is used when the phone is idle."))
        {
            return;
        }

        var extension = DeskPhone.Digits(destination);
        if (extension.Length == 0)
        {
            Banner = "Enter an extension, then press Intercom.";
            Touch();
            return;
        }

        Dial(1, DeskPhone.IntercomTo(extension));
    }

    public void DialForwardAll(string? destination)
    {
        if (!RequireIdle("Call forward is set when the phone is idle."))
        {
            return;
        }

        Dial(1, DeskPhone.ForwardAllTo(destination));
    }

    public void DialRedial()
    {
        var last = _store.History.FirstOrDefault(call =>
            call.Direction.Equals("Out", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(call.Number));
        if (last == null)
        {
            Banner = "There is no number to redial.";
            Touch();
            return;
        }

        Dial(1, last.Number);
    }

    public void Park()
    {
        var line = new[] { _line1, _line2 }.FirstOrDefault(item => item.Phase == "InCall" && !item.Held)
            ?? new[] { _line1, _line2 }.FirstOrDefault(item => item.Phase == "InCall");
        if (line == null)
        {
            Banner = "Park is used during a call. The PBX announces the parking slot.";
            Touch();
            return;
        }

        _ = ParkAsync(line);
    }

    public void SetConference(bool enabled)
    {
        ConferenceActive = enabled;
        _hub.Conference = enabled;
        if (_line1.Audio != null)
        {
            _line1.Audio.ConferenceMix = enabled;
        }

        if (_line2.Audio != null)
        {
            _line2.Audio.ConferenceMix = enabled;
        }

        Touch();
    }

    public async Task<string> BlindTransferAsync(int lineId, string destination)
    {
        destination = Normalize(destination);
        var line = Slot(lineId);
        if (line.Agent?.Dialogue == null || destination.Length == 0)
        {
            return "Choose a connected call and a transfer number.";
        }

        var uri = SIPURI.ParseSIPURI($"sip:{destination}@{_store.Config.ResolvedDomain}");
        var ok = await line.Agent.BlindTransfer(uri, TimeSpan.FromSeconds(8), CancellationToken.None);
        return ok ? "Blind transfer started." : "The transfer was not accepted.";
    }

    public async Task<string> AttendedTransferAsync(int lineId)
    {
        var line = Slot(lineId);
        var other = lineId == 1 ? _line2 : _line1;
        if (line.Agent?.Dialogue == null || other.Agent?.Dialogue == null)
        {
            return "Connect the second line, then complete the attended transfer.";
        }

        var ok = await line.Agent.AttendedTransfer(other.Agent.Dialogue, TimeSpan.FromSeconds(8), CancellationToken.None);
        return ok ? "Attended transfer started." : "The attended transfer was not accepted.";
    }

    public void SendDigit(char digit)
    {
        _hub.PlayDigits(digit.ToString());
        foreach (var line in new[] { _line1, _line2 })
        {
            if (line.Phase is not ("InCall" or "Outgoing") || line.Agent == null)
            {
                continue;
            }

            var tone = digit switch
            {
                >= '0' and <= '9' => (byte)(digit - '0'),
                '*' => (byte)10,
                '#' => (byte)11,
                _ => byte.MaxValue
            };
            if (tone != byte.MaxValue)
            {
                _ = line.Agent.SendDtmf(tone);
            }
        }
    }

    public async Task<string> SendMessageAsync(string number, string text)
    {
        number = Normalize(number);
        text = text.Trim();
        if (!IsRegistered || _transport == null || number.Length == 0 || text.Length == 0)
        {
            return "Register and enter a message before sending.";
        }

        var config = _store.Config;
        var to = SIPURI.ParseSIPURI($"sip:{number}@{config.ResolvedDomain}");
        var from = SIPURI.ParseSIPURI($"sip:{config.Extension.Trim()}@{config.ResolvedDomain}");
        var request = SIPRequest.GetRequest(SIPMethodsEnum.MESSAGE, to);
        request.Header.From = new SIPFromHeader(config.DisplayName, from, Guid.NewGuid().ToString("N")[..8]);
        request.Header.To = new SIPToHeader(null, to, null);
        request.Header.ContentType = "text/plain";
        request.Body = text;
        var code = await SendNonInviteAsync(request);
        var result = code is >= 200 and < 300 ? "Sent" : "Failed " + code;
        _store.AddMessage(new DeskMessage
        {
            Direction = "Out",
            Name = _store.LookupName(number),
            Number = number,
            Message = text,
            Result = result
        });
        ListRevision++;
        Touch();
        return result;
    }

    public async Task<string> SendOptionsAsync()
    {
        if (_transport == null || !IsRegistered)
        {
            return "Not registered.";
        }

        var config = _store.Config;
        var target = SIPURI.ParseSIPURI(RegistrarUri(config));
        var request = SIPRequest.GetRequest(SIPMethodsEnum.OPTIONS, target);
        var watch = Stopwatch.StartNew();
        var code = await SendNonInviteAsync(request);
        watch.Stop();
        var text = code == 0 ? "OPTIONS timed out." : $"OPTIONS returned {code}.";
        if (code is >= 200 and < 300)
        {
            var latency = watch.Elapsed.TotalMilliseconds;
            if (latency > 0)
            {
                NoteLatency(latency);
            }

            if (BlfState.IsBusyOrDnd(_publishedPresence))
            {
                _ = PublishPresenceAsync(_publishedPresence);
            }
        }
        else
        {
            DeskLog.Write(text);
        }

        return text;
    }

    public LineSnapshot Snapshot(int lineId)
    {
        var line = Slot(lineId);
        var audio = line.Audio;
        return new LineSnapshot
        {
            Id = lineId,
            Phase = line.Phase,
            Remote = line.Number,
            RemoteName = line.Name,
            Seconds = line.Seconds,
            Muted = line.Muted,
            Held = line.Held,
            Recording = line.Recording,
            Video = line.Video,
            Codec = audio?.Codec ?? "",
            PacketsSent = audio?.PacketsSent ?? 0,
            PacketsReceived = audio?.PacketsReceived ?? 0,
            PacketsLost = audio?.QualityMeasured == true ? audio.PacketsLost : 0,
            JitterMs = audio?.QualityMeasured == true ? audio.JitterMs : 0,
            LossPercent = audio?.QualityMeasured == true ? audio.LossPercent : 0,
            LatencyMs = audio?.QualityMeasured == true ? audio.LatencyMs : 0,
            Mos = audio?.Mos ?? 0,
            SignalBars = audio?.SignalBars ?? 0,
            QualityMeasured = audio?.QualityMeasured == true,
            QualityText = audio?.QualityText ?? "Not measured",
            RecordingPath = line.RecordingPath
        };
    }

    public void Dispose()
    {
        _hub.Ringing = false;
        TearDown();
        _hub.Dispose();
    }

    private async Task DialCore(CallSlot line, string number, bool video)
    {
        if (_registration?.IsRegistered != true || line.Agent == null)
        {
            Banner = "Register the SIP account before dialling.";
            Touch();
            return;
        }

        var config = _store.Config;
        Begin(line, number, "Out", video);
        line.Phase = "Outgoing";
        SetStatus("Calling", "Calling " + number);
        _ = PublishPresenceAsync("Busy");
        try
        {
            var media = CreateMedia(line);
            var descriptor = new SIPCallDescriptor(
                config.Extension.Trim(),
                config.Password,
                $"sip:{number}@{config.ResolvedDomain}",
                $"sip:{config.Extension.Trim()}@{config.ResolvedDomain}",
                $"sip:{number}@{config.ResolvedDomain}",
                null,
                null,
                config.AuthUsername,
                SIPCallDirection.Out,
                null,
                null,
                null);
            if (!string.IsNullOrWhiteSpace(config.DisplayName))
            {
                descriptor.FromDisplayName = config.DisplayName.Trim();
            }

            _hub.FocusLine = line.Id;
            var answered = await line.Agent.Call(descriptor, media, 60);
            if (!answered && line.Phase == "Outgoing")
            {
                Finish(line, "Failed");
                Banner = "The call was not answered.";
                RestoreIdleStatus();
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("Dial failed: " + ex.Message);
            Finish(line, "Failed");
            Banner = ex.Message;
            RestoreIdleStatus();
        }
    }

    private async Task AnswerCore(CallSlot line)
    {
        var incoming = line.Incoming;
        line.Incoming = null;
        if (incoming == null || line.Agent == null)
        {
            return;
        }

        _hub.Ringing = false;
        try
        {
            var media = CreateMedia(line);
            _hub.FocusLine = line.Id;
            var answered = await line.Agent.Answer(incoming, media, null);
            if (answered)
            {
                MarkConnected(line);
            }
            else
            {
                Finish(line, "Failed");
                Banner = "The call could not be answered.";
                RestoreIdleStatus();
            }
        }
        catch (Exception ex)
        {
            Finish(line, "Failed");
            Banner = ex.Message;
            RestoreIdleStatus();
        }
    }

    private void DeclineCore(CallSlot line)
    {
        _hub.Ringing = false;
        var incoming = line.Incoming;
        line.Incoming = null;
        try
        {
            var voicemail = _store.Config.DeclineAction.Contains("voicemail", StringComparison.OrdinalIgnoreCase);
            incoming?.Reject(voicemail ? SIPResponseStatusCodesEnum.TemporarilyUnavailable : SIPResponseStatusCodesEnum.Decline, voicemail ? "Voicemail" : "Declined");
        }
        catch
        {
            // The caller may already have cancelled.
        }

        Finish(line, "Declined");
        RestoreIdleStatus();
    }

    private void OpenRegistration()
    {
        var config = _store.Config;
        if (string.IsNullOrWhiteSpace(config.Extension) || string.IsNullOrWhiteSpace(config.Server))
        {
            SetStatus("Offline", "The SIP account is incomplete.");
            return;
        }

        try
        {
            TearDownSignalling();
            SetStatus("Registering", "Contacting " + config.Server);
            _transport = new SIPTransport();
            AddChannel(config);
            _transport.SIPTransportRequestReceived += OnTransportRequest;
            _line1.Agent = CreateAgent();
            _line2.Agent = CreateAgent();
            Wire(_line1);
            Wire(_line2);

            var aor = SIPURI.ParseSIPURI(AccountUri(config));
            _registration = new SIPRegistrationUserAgent(
                _transport,
                null,
                aor,
                config.AuthUsername,
                config.Password,
                null,
                RegistrarHost(config),
                null,
                Math.Clamp(config.RegistrationExpiry, 120, 7200),
                null,
                15,
                20,
                3,
                false)
            {
                UserDisplayName = config.DisplayName
            };
            _registration.RegistrationSuccessful += (_, _) =>
            {
                SetStatus("Registered", "Ready on extension " + config.Extension);
                Banner = "";
                ScheduleHousekeeping();
                _ = PublishSelectedPresenceAsync();
            };
            _registration.RegistrationFailed += (_, response, message) => FailRegistration(response, message);
            _registration.RegistrationTemporaryFailure += (_, response, message) => FailRegistration(response, message);
            _registration.RegistrationRemoved += (_, _) =>
            {
                if (!AnyLive())
                {
                    SetStatus("Offline", "Registration removed.");
                }
            };
            _registration.Start();
        }
        catch (Exception ex)
        {
            DeskLog.Write("Registration failed to start: " + ex.Message);
            SetStatus("Offline", ex.Message);
        }
    }

    private void AddChannel(DeskConfig config)
    {
        var port = config.LocalSipPort is > 0 and < 65536 ? config.LocalSipPort : 0;
        var endpoint = new IPEndPoint(IPAddress.Any, port);
        try
        {
            AddChannel(config, endpoint);
        }
        catch (Exception ex)
        {
            DeskLog.Write($"Could not bind local port {port}: {ex.Message}");
            AddChannel(config, new IPEndPoint(IPAddress.Any, 0));
        }
    }

    private void AddChannel(DeskConfig config, IPEndPoint endpoint)
    {
        if (config.UsesTls)
        {
            _transport!.AddSIPChannel(new SIPTLSChannel(MakeCertificate(), endpoint));
        }
        else if (config.UsesTcp)
        {
            _transport!.AddSIPChannel(new SIPTCPChannel(endpoint));
        }
        else
        {
            _transport!.AddSIPChannel(new SIPUDPChannel(endpoint));
        }
    }

    private SIPUserAgent CreateAgent() => new(_transport, null, false);

    private void Wire(CallSlot line)
    {
        var agent = line.Agent!;
        agent.OnIncomingCall += (_, request) => OnIncoming(line, request);
        agent.ClientCallTrying += (_, _) =>
        {
            if (line.Phase == "Outgoing")
            {
                SetStatus("Calling", "Calling " + line.Number);
            }
        };
        agent.ClientCallRinging += (_, _) =>
        {
            if (line.Phase == "Outgoing")
            {
                SetStatus("Ringing", line.Number + " is ringing");
            }
        };
        agent.ClientCallAnswered += (_, _) => MarkConnected(line);
        agent.ClientCallFailed += (_, error, _) =>
        {
            Banner = string.IsNullOrWhiteSpace(error) ? "Call failed." : error;
            Finish(line, line.Phase == "InCall" ? "Answered" : "Failed");
            RestoreIdleStatus();
        };
        agent.ServerCallCancelled += (_, _) =>
        {
            Finish(line, "Missed");
            RestoreIdleStatus();
        };
        agent.OnCallHungup += _ =>
        {
            var result = line.Phase == "InCall" ? "Answered" : line.Phase == "Incoming" ? "Missed" : "Cancelled";
            Finish(line, result);
            RestoreIdleStatus();
        };
    }

    private void OnIncoming(CallSlot line, SIPRequest request)
    {
        if (line.Phase != "Idle")
        {
            return;
        }

        var callId = request.Header.CallId ?? "";
        lock (_gate)
        {
            if (_claimedCallId == callId)
            {
                return;
            }

            if (DoNotDisturb)
            {
                return;
            }

            if (!_store.Config.CallWaiting && AnyLive())
            {
                return;
            }

            _claimedCallId = callId;
        }

        SIPServerUserAgent incoming;
        try
        {
            incoming = line.Agent!.AcceptCall(request);
        }
        catch (Exception ex)
        {
            DeskLog.Write("Accept call failed: " + ex.Message);
            return;
        }

        var user = request.Header.From?.FromURI?.User ?? "Unknown";
        var name = request.Header.From?.FromName?.Trim().Trim('"');
        line.Incoming = incoming;
        Begin(line, user, "In", false);
        line.Name = string.IsNullOrWhiteSpace(name) ? _store.LookupName(user) : name;
        line.Phase = "Incoming";
        _hub.Ringing = true;
        SetStatus("Incoming", "Incoming call from " + line.Name);
        if (AutoAnswer)
        {
            _ = Task.Run(async () =>
            {
                await Task.Delay(600);
                if (line.Phase == "Incoming")
                {
                    await AnswerCore(line);
                }
            });
        }
    }

    private Task OnTransportRequest(SIPEndPoint local, SIPEndPoint remote, SIPRequest request)
    {
        try
        {
            if (request.Method == SIPMethodsEnum.INVITE && string.IsNullOrWhiteSpace(request.Header.To?.ToTag))
            {
                var callId = request.Header.CallId ?? "";
                lock (_gate)
                {
                    if (_claimedCallId == callId)
                    {
                        return Task.CompletedTask;
                    }

                    _claimedCallId = callId;
                }

                var response = SIPResponse.GetResponse(request, SIPResponseStatusCodesEnum.BusyHere, DoNotDisturb ? "Do not disturb" : "Busy");
                return _transport?.SendResponseAsync(response) ?? Task.CompletedTask;
            }

            if (request.Method is SIPMethodsEnum.OPTIONS or SIPMethodsEnum.NOTIFY or SIPMethodsEnum.MESSAGE)
            {
                if (request.Method == SIPMethodsEnum.NOTIFY)
                {
                    ParseNotify(request);
                }
                else if (request.Method == SIPMethodsEnum.MESSAGE)
                {
                    var user = request.Header.From?.FromURI?.User ?? "";
                    _store.AddMessage(new DeskMessage
                    {
                        Direction = "In",
                        Name = _store.LookupName(user),
                        Number = user,
                        Message = request.Body ?? "",
                        Result = "Received"
                    });
                    ListRevision++;
                    Banner = "New message from " + _store.LookupName(user);
                    Touch();
                }

                if (!IsOurDialog(request))
                {
                    var ok = SIPResponse.GetResponse(request, SIPResponseStatusCodesEnum.Ok, null);
                    return _transport?.SendResponseAsync(ok) ?? Task.CompletedTask;
                }
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("SIP request failed: " + ex.Message);
        }

        return Task.CompletedTask;
    }

    private bool IsOurDialog(SIPRequest request)
    {
        var callId = request.Header.CallId;
        return callId == _line1.Agent?.Dialogue?.CallId || callId == _line2.Agent?.Dialogue?.CallId;
    }

    private void ParseNotify(SIPRequest request)
    {
        var body = request.Body ?? "";
        if (body.Contains("Messages-Waiting", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(body, @"Voice-Message:\s*(\d+)");
            VoicemailWaiting = match.Success
                ? int.Parse(match.Groups[1].Value)
                : body.Contains("Messages-Waiting: yes", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
            ListRevision++;
            Touch();
            return;
        }

        ApplyBlfNotify(request, body);
    }

    private void ApplyBlfNotify(SIPRequest request, string body)
    {
        var presence = BlfState.ParsePresenceState(body);
        if (string.IsNullOrWhiteSpace(presence))
        {
            return;
        }

        var callId = request.Header.CallId ?? "";
        string extension = "";
        if (!string.IsNullOrWhiteSpace(callId) && _subscriptionTargets.TryGetValue(callId, out var subscribed))
        {
            extension = subscribed;
        }

        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = BlfState.ExtractPresenceExtension(body);
        }

        if (string.IsNullOrWhiteSpace(extension))
        {
            var fromUser = request.Header.From?.FromURI?.User ?? "";
            var fromExt = BlfState.NormalizeExtension(fromUser);
            if (!fromExt.Equals("asterisk", StringComparison.OrdinalIgnoreCase) &&
                !fromExt.Equals("pbx", StringComparison.OrdinalIgnoreCase))
            {
                extension = fromExt;
            }
        }

        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = BlfState.NormalizeExtension(request.Header.To?.ToURI?.User ?? "");
        }

        var key = BlfState.NormalizeExtension(extension);
        if (key.Length == 0)
        {
            return;
        }

        var eventName = (request.Header.Event ?? "").Split(';')[0].Trim();
        _blf.TryGetValue(key, out var channels);
        channels = BlfChannels.Apply(channels, presence, eventName);
        _blf[key] = channels;
        var resolved = channels.Resolve();
        var changed = false;
        foreach (var contact in _store.Contacts)
        {
            if (!string.Equals(BlfState.NormalizeExtension(contact.Number), key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (contact.Presence != resolved)
            {
                contact.Presence = resolved;
                changed = true;
            }
        }

        if (changed)
        {
            DeskLog.Write($"BLF {key} {resolved} event={eventName}");
            ListRevision++;
            Touch();
        }
    }

    private VoIPMediaSession CreateMedia(CallSlot line)
    {
        CloseMedia(line);
        var audio = new MacAudioEndPoint(line.Id, _hub, new AudioEncoder());
        var codecs = _store.Config.PreferredCodecs.ToUpperInvariant();
        audio.RestrictFormats(format =>
            (format.Codec == AudioCodecsEnum.PCMU && codecs.Contains("PCMU")) ||
            (format.Codec == AudioCodecsEnum.PCMA && codecs.Contains("PCMA")));
        audio.Muted = line.Muted;
        audio.ConferenceMix = ConferenceActive;
        if (_measuredLatencyMs > 0)
        {
            audio.SetMeasuredLatency(_measuredLatencyMs);
        }
        var session = new VoIPMediaSession(new MediaEndPoints
        {
            AudioSource = audio,
            AudioSink = audio
        });
        session.AcceptRtpFromAny = true;
        line.Audio = audio;
        line.Media = session;
        return session;
    }

    private void MarkConnected(CallSlot line)
    {
        if (line.Phase == "Idle")
        {
            return;
        }

        _hub.Ringing = !IncomingOther(line);
        line.Phase = "InCall";
        line.Clock?.Dispose();
        line.Clock = new Timer(_ =>
        {
            line.Seconds++;
            Touch();
        }, null, 1000, 1000);
        _hub.FocusLine = line.Id;
        SetStatus("In call", line.Name + " · " + line.Number);
        _ = PublishPresenceAsync("Busy");
        _ = SendOptionsAsync();
        if (_conferencePending && _line1.Phase == "InCall" && _line2.Phase == "InCall")
        {
            _conferencePending = false;
            SetConference(true);
        }
    }

    private bool IncomingOther(CallSlot line) =>
        (line.Id == 1 ? _line2 : _line1).Phase == "Incoming";

    private void Begin(CallSlot line, string number, string direction, bool video)
    {
        line.Number = number;
        line.Name = _store.LookupName(number);
        line.Direction = direction;
        line.Video = video;
        line.Logged = false;
        line.Seconds = 0;
        line.Muted = false;
        line.Held = false;
        line.Recording = false;
        line.RecordingPath = "";
        Touch();
    }

    private void Finish(CallSlot line, string result)
    {
        if (line.Logged || string.IsNullOrWhiteSpace(line.Number))
        {
            CloseMedia(line);
            line.Phase = "Idle";
            line.Incoming = null;
            _hub.Ringing = AnyIncoming();
            if (!AnyRecording())
            {
                _hub.StopRecording();
            }

            if (!AnyLive())
            {
                ConferenceActive = false;
                _hub.Conference = false;
            }

            Touch();
            RestorePresenceIfIdle();
            return;
        }

        line.Logged = true;
        line.Clock?.Dispose();
        line.Clock = null;
        var audio = line.Audio;
        var measured = audio?.QualityMeasured == true;
        _store.AddHistory(new DeskCall
        {
            Direction = line.Direction,
            Name = line.Name,
            Number = line.Number,
            Result = result,
            Seconds = result == "Answered" ? line.Seconds : 0,
            Codec = measured ? audio!.Codec : "",
            MosScore = measured ? Math.Round(audio!.Mos, 1) : 0,
            PacketLossPercent = measured ? Math.Round(audio!.LossPercent, 2) : 0,
            JitterMs = measured ? Math.Round(audio!.JitterMs, 1) : 0
        });
        CloseMedia(line);
        line.Phase = "Idle";
        line.Number = "";
        line.Incoming = null;
        line.Video = false;
        _hub.Ringing = AnyIncoming();
        if (!AnyRecording())
        {
            _hub.StopRecording();
        }

        if (!AnyLive())
        {
            ConferenceActive = false;
            _hub.Conference = false;
            _conferencePending = false;
        }

        ListRevision++;
        Touch();
        RestorePresenceIfIdle();
    }

    private void CloseMedia(CallSlot line)
    {
        try
        {
            line.Audio?.Close();
        }
        catch
        {
            // The device may already be closed.
        }

        try
        {
            line.Media?.Close("call ended");
        }
        catch
        {
            // The RTP session may already be closed.
        }

        line.Audio = null;
        line.Media = null;
    }

    private void RestoreIdleStatus()
    {
        if (AnyLive())
        {
            return;
        }

        if (IsRegistered)
        {
            SetStatus("Registered", "Ready on extension " + _store.Config.Extension);
        }
    }

    private void FailRegistration(SIPResponse? response, string message)
    {
        var reason = string.IsNullOrWhiteSpace(message)
            ? response == null ? "Registration failed." : $"{(int)response.Status} {response.ReasonPhrase}"
            : message;
        DeskLog.Write(reason);
        if (!AnyLive())
        {
            SetStatus("Not registered", reason);
        }
    }

    private void ScheduleHousekeeping()
    {
        _heartbeat?.Dispose();
        var seconds = Math.Clamp(_store.Config.HeartbeatSeconds, 0, 300);
        if (seconds > 0)
        {
            _heartbeat = new Timer(_ =>
            {
                if (IsRegistered)
                {
                    _ = SendOptionsAsync();
                }
            }, null, TimeSpan.FromSeconds(seconds), TimeSpan.FromSeconds(seconds));
        }

        _subscribe?.Dispose();
        _subscribe = new Timer(_ => SendSubscriptions(), null, TimeSpan.FromSeconds(3), TimeSpan.FromMinutes(50));
    }

    private void SendSubscriptions() => _ = SendSubscriptionsAsync();

    private async Task SendSubscriptionsAsync()
    {
        if (!IsRegistered || _transport == null)
        {
            return;
        }

        try
        {
            var targets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var own = BlfState.NormalizeExtension(_store.Config.Extension);
            if (own.Length is > 0 and <= 10)
            {
                targets.Add(own);
            }

            foreach (var contact in _store.Contacts)
            {
                var extension = BlfState.NormalizeExtension(contact.Number);
                if (extension.Length is > 0 and <= 10)
                {
                    targets.Add(extension);
                }
            }

            await SendSubscribeAsync("message-summary", _store.Config.Extension.Trim());
            foreach (var extension in targets)
            {
                await SendSubscribeAsync("dialog", extension);
                await SendSubscribeAsync("presence", extension);
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("BLF subscribe failed: " + ex.Message);
        }
    }

    private async Task SendSubscribeAsync(string eventName, string user)
    {
        if (_transport == null || string.IsNullOrWhiteSpace(user))
        {
            return;
        }

        var config = _store.Config;
        var target = SIPURI.ParseSIPURI($"sip:{user}@{config.ResolvedDomain}");
        var from = SIPURI.ParseSIPURI($"sip:{config.Extension.Trim()}@{config.ResolvedDomain}");
        var request = SIPRequest.GetRequest(SIPMethodsEnum.SUBSCRIBE, target);
        request.Header.From = new SIPFromHeader(config.DisplayName, from, Guid.NewGuid().ToString("N")[..8]);
        request.Header.To = new SIPToHeader(null, target, null);
        request.Header.Event = eventName;
        request.Header.Expires = 3600;
        request.Header.CSeq = _cseq++;
        request.Header.Accept = eventName switch
        {
            "message-summary" => "application/simple-message-summary",
            "dialog" => "application/dialog-info+xml",
            _ => "application/pidf+xml"
        };
        if (!string.IsNullOrWhiteSpace(request.Header.CallId))
        {
            _subscriptionTargets[request.Header.CallId] = user;
        }

        var response = await SendAuthenticatedAsync(request);
        var code = response == null ? 0 : (int)response.Status;
        if (code is < 200 or >= 300)
        {
            DeskLog.Write($"SUBSCRIBE {eventName} {user} failed code={code}");
        }
    }

    private async Task<int> SendNonInviteAsync(SIPRequest request)
    {
        var response = await SendRawAsync(request);
        return response == null ? 0 : (int)response.Status;
    }

    private async Task<SIPResponse?> SendAuthenticatedAsync(SIPRequest request)
    {
        var response = await SendRawAsync(request);
        if (response?.Status is SIPResponseStatusCodesEnum.Unauthorised or SIPResponseStatusCodesEnum.ProxyAuthenticationRequired)
        {
            var config = _store.Config;
            var challenges = response.Header.AuthenticationHeaders;
            if (challenges is { Count: > 0 })
            {
                var authed = request.DuplicateAndAuthenticate(challenges, config.AuthUsername, config.Password);
                CopySigningHeaders(request, authed);
                response = await SendRawAsync(authed);
            }
        }

        return response;
    }

    private static void CopySigningHeaders(SIPRequest source, SIPRequest destination)
    {
        if (string.IsNullOrWhiteSpace(destination.Header.Event))
        {
            destination.Header.Event = source.Header.Event;
        }

        if (string.IsNullOrWhiteSpace(destination.Header.ContentType))
        {
            destination.Header.ContentType = source.Header.ContentType;
        }

        if (string.IsNullOrWhiteSpace(destination.Header.Accept))
        {
            destination.Header.Accept = source.Header.Accept;
        }

        destination.Body ??= source.Body;
        destination.Header.UnknownHeaders ??= [];
        foreach (var header in source.Header.UnknownHeaders ?? [])
        {
            if (!destination.Header.UnknownHeaders.Contains(header))
            {
                destination.Header.UnknownHeaders.Add(header);
            }
        }
    }

    private async Task<SIPResponse?> SendRawAsync(SIPRequest request)
    {
        if (_transport == null)
        {
            return null;
        }

        var done = new TaskCompletionSource<SIPResponse?>();
        var transaction = new SIPNonInviteTransaction(_transport, request, null);
        transaction.NonInviteTransactionFinalResponseReceived += (_, _, _, response) =>
        {
            done.TrySetResult(response);
            return Task.FromResult(SocketError.Success);
        };
        transaction.NonInviteTransactionFailed += (_, _) => done.TrySetResult(null);
        transaction.SendRequest();
        var finished = await Task.WhenAny(done.Task, Task.Delay(8000));
        return finished == done.Task ? await done.Task : null;
    }

    private bool RequireIdle(string message)
    {
        if (!AnyLive())
        {
            return true;
        }

        Banner = message;
        Touch();
        return false;
    }

    private async Task ApplyPresenceAsync(string status, bool wasDnd)
    {
        Banner = status == "DND"
            ? "Do not disturb is on."
            : wasDnd && status == "Available"
                ? "Do not disturb is off."
                : $"Presence set to {status}.";
        Touch();
        await PublishPresenceAsync(status);
        if (wasDnd == (status == "DND") || AnyLive() || !IsRegistered)
        {
            return;
        }

        Dial(1, status == "DND" ? DeskPhone.DndOn : DeskPhone.DndOff);
    }

    private void RestorePresenceIfIdle()
    {
        if (!AnyLive())
        {
            _ = PublishPresenceAsync(_store.Config.Presence);
        }
    }

    private Task PublishSelectedPresenceAsync()
    {
        var status = string.IsNullOrWhiteSpace(_publishedPresence) ? _store.Config.Presence : _publishedPresence;
        return string.IsNullOrWhiteSpace(status) || status.Equals("Offline", StringComparison.OrdinalIgnoreCase)
            ? Task.CompletedTask
            : PublishPresenceAsync(status);
    }

    private async Task PublishPresenceAsync(string status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return;
        }

        await _publishLock.WaitAsync();
        try
        {
            _publishedPresence = status;
            if (!IsRegistered || _transport == null || status.Equals("Offline", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var extension = _store.Config.Extension.Trim();
            var domain = _store.Config.ResolvedDomain;
            if (extension.Length == 0 || domain.Length == 0)
            {
                return;
            }

            if (string.IsNullOrEmpty(_publishCallId))
            {
                _publishCallId = Guid.NewGuid().ToString("N");
                _publishTag = Guid.NewGuid().ToString("N")[..12];
            }

            var note = BlfState.PresenceNote(status);
            var body = BlfState.BuildPresenceXml(extension, domain, status);
            var expires = BlfState.PresenceExpires(status);
            var response = await SendPublishAsync(extension, body, expires);
            if (response != null && (int)response.Status == 412)
            {
                _publishEtag = "";
                response = await SendPublishAsync(extension, body, expires);
            }

            var code = response == null ? 0 : (int)response.Status;
            if (code is >= 200 and < 300)
            {
                var etag = HeaderValue(response!, "SIP-ETag");
                if (!string.IsNullOrWhiteSpace(etag))
                {
                    _publishEtag = etag.Trim();
                }

                if (expires == 0)
                {
                    _publishEtag = "";
                }

                DeskLog.Write($"BLF publish presence status={status} note={note} code={code}");
            }
            else
            {
                DeskLog.Write($"BLF publish presence failed status={status} note={note} code={code}");
            }

            if (BlfState.IsBusyOrDnd(status))
            {
                await SendDialogNotifyAsync(extension, true);
            }
            else if (status.Equals("Available", StringComparison.OrdinalIgnoreCase))
            {
                await SendDialogNotifyAsync(extension, false);
            }
        }
        catch (Exception ex)
        {
            DeskLog.Write("Publish presence failed: " + ex.Message);
        }
        finally
        {
            _publishLock.Release();
        }
    }

    private async Task<SIPResponse?> SendPublishAsync(string extension, string body, int expires)
    {
        var config = _store.Config;
        var target = SIPURI.ParseSIPURI($"sip:{extension}@{config.ResolvedDomain}");
        var from = SIPURI.ParseSIPURI($"sip:{extension}@{config.ResolvedDomain}");
        var request = SIPRequest.GetRequest(SIPMethodsEnum.PUBLISH, target, new SIPToHeader(null, target, null), new SIPFromHeader(config.DisplayName, from, _publishTag));
        request.Header.CallId = _publishCallId;
        request.Header.CSeq = _publishCseq++;
        request.Header.Event = "presence";
        request.Header.Expires = expires;
        request.Header.ContentType = "application/pidf+xml";
        request.Body = body;
        if (!string.IsNullOrEmpty(_publishEtag))
        {
            request.Header.UnknownHeaders ??= [];
            request.Header.UnknownHeaders.Add("SIP-If-Match: " + _publishEtag);
        }

        return await SendAuthenticatedAsync(request);
    }

    private async Task SendDialogNotifyAsync(string extension, bool offHook)
    {
        var config = _store.Config;
        if (string.IsNullOrEmpty(_notifyCallId))
        {
            _notifyCallId = Guid.NewGuid().ToString("N");
            _notifyTag = Guid.NewGuid().ToString("N")[..12];
        }

        var target = SIPURI.ParseSIPURI($"sip:{extension}@{config.ResolvedDomain}");
        var from = SIPURI.ParseSIPURI($"sip:{extension}@{config.ResolvedDomain}");
        var request = SIPRequest.GetRequest(SIPMethodsEnum.NOTIFY, target, new SIPToHeader(null, target, null), new SIPFromHeader(config.DisplayName, from, _notifyTag));
        request.Header.CallId = _notifyCallId;
        request.Header.CSeq = _notifyCseq++;
        request.Header.Event = "dialog";
        request.Header.ContentType = "application/dialog-info+xml";
        request.Header.UnknownHeaders ??= [];
        request.Header.UnknownHeaders.Add(offHook
            ? "Subscription-State: active;expires=3600"
            : "Subscription-State: terminated;reason=noresource");
        request.Body = BlfState.BuildDialogXml(extension, config.ResolvedDomain, offHook);
        var response = await SendAuthenticatedAsync(request);
        var note = offHook ? DeskPhone.BusyHereStatus : "Phone is on the hook and available";
        DeskLog.Write($"SEND NOTIFY off-hook={offHook} note={note} code={(response == null ? 0 : (int)response.Status)}");
    }

    private static string HeaderValue(SIPResponse response, string name)
    {
        foreach (var line in response.Header.UnknownHeaders ?? [])
        {
            if (line.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase))
            {
                return line[(name.Length + 1)..].Trim();
            }
        }

        return "";
    }

    private void NoteLatency(double milliseconds)
    {
        if (milliseconds <= 0)
        {
            return;
        }

        _measuredLatencyMs = milliseconds;
        _line1.Audio?.SetMeasuredLatency(milliseconds);
        _line2.Audio?.SetMeasuredLatency(milliseconds);
        Touch();
    }

    private async Task ParkAsync(CallSlot line)
    {
        var sent = await SendDtmfAsync(line, DeskPhone.Park);
        Banner = sent
            ? "Park code *6 sent. Listen for the parking slot, then dial that slot from another phone."
            : "Park code could not be sent.";
        Touch();
    }

    private async Task SendRecordCodeAsync(CallSlot line, string code, bool started)
    {
        var sent = await SendDtmfAsync(line, code);
        Banner = started
            ? sent ? $"Recording locally and sent {code} to the PBX." : "Recording locally."
            : sent ? $"Local recording stopped. Sent {code} to the PBX." : "Local recording stopped.";
        Touch();
    }

    private async Task<bool> SendDtmfAsync(CallSlot line, string code)
    {
        if (line.Agent == null || line.Phase != "InCall")
        {
            return false;
        }

        var digits = DeskPhone.DtmfDigits(code);
        if (digits.Count == 0)
        {
            return false;
        }

        _hub.PlayDigits(new string(digits.ToArray()));
        foreach (var digit in digits)
        {
            var tone = digit switch
            {
                >= '0' and <= '9' => (byte)(digit - '0'),
                '*' => (byte)10,
                '#' => (byte)11,
                _ => byte.MaxValue
            };
            if (tone == byte.MaxValue)
            {
                continue;
            }

            await line.Agent.SendDtmf(tone);
            await Task.Delay(160);
        }

        return true;
    }

    private void TearDown()
    {
        _heartbeat?.Dispose();
        _subscribe?.Dispose();
        _heartbeat = null;
        _subscribe = null;
        HangupQuiet(_line1);
        HangupQuiet(_line2);
        TearDownSignalling();
    }

    private void HangupQuiet(CallSlot line)
    {
        try
        {
            line.Agent?.Hangup();
        }
        catch
        {
            // Nothing to hang up.
        }

        Finish(line, "Cancelled");
    }

    private void TearDownSignalling()
    {
        _hub.Ringing = false;
        try
        {
            _registration?.Stop(false);
        }
        catch
        {
            // The registrar may already be unreachable.
        }

        try
        {
            _line1.Agent?.Dispose();
            _line2.Agent?.Dispose();
        }
        catch
        {
            // Disposal is best-effort during a restart.
        }

        try
        {
            _transport?.Shutdown();
        }
        catch
        {
            // The socket may already be closed.
        }

        _line1.Agent = null;
        _line2.Agent = null;
        _registration = null;
        _transport = null;
        _claimedCallId = "";
    }

    private CallSlot? IdleLine(int preferred)
    {
        var first = preferred == 2 ? _line2 : _line1;
        var second = preferred == 2 ? _line1 : _line2;
        if (first.Phase == "Idle" && first.Agent != null)
        {
            return first;
        }

        if (second.Phase == "Idle" && second.Agent != null)
        {
            return second;
        }

        return null;
    }

    private CallSlot Slot(int lineId) => lineId == 2 ? _line2 : _line1;
    private bool AnyLive() => _line1.Phase != "Idle" || _line2.Phase != "Idle";
    private bool AnyIncoming() => _line1.Phase == "Incoming" || _line2.Phase == "Incoming";
    private bool AnyRecording() => _line1.Recording || _line2.Recording;

    private void SetStatus(string status, string detail)
    {
        StatusText = status;
        DetailText = detail;
        Touch();
    }

    private void Touch() => Revision++;

    public void PrepareConferenceDial() => _conferencePending = true;

    private static string Normalize(string number) =>
        new(number.Where(ch => char.IsDigit(ch) || ch is '+' or '*' or '#').ToArray());

    private static string AccountUri(DeskConfig config)
    {
        var scheme = config.UsesTls ? "sips" : "sip";
        var transport = config.UsesTls ? "" : config.UsesTcp ? ";transport=tcp" : "";
        return $"{scheme}:{config.Extension.Trim()}@{config.ResolvedDomain}:{config.Port}{transport}";
    }

    private static string RegistrarHost(DeskConfig config) =>
        config.Port is > 0 and not 5060 ? $"{config.Server}:{config.Port}" : config.Server;

    private static string RegistrarUri(DeskConfig config)
    {
        var scheme = config.UsesTls ? "sips" : "sip";
        var transport = config.UsesTcp ? ";transport=tcp" : "";
        return $"{scheme}:{config.Server}:{config.Port}{transport}";
    }

    private static X509Certificate2 MakeCertificate()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=MerlinSIP", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var issued = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(2));
        return X509CertificateLoader.LoadPkcs12(issued.Export(X509ContentType.Pfx), null);
    }

    private sealed class CallSlot
    {
        public CallSlot(int id) => Id = id;
        public int Id { get; }
        public SIPUserAgent? Agent { get; set; }
        public SIPServerUserAgent? Incoming { get; set; }
        public VoIPMediaSession? Media { get; set; }
        public MacAudioEndPoint? Audio { get; set; }
        public string Phase { get; set; } = "Idle";
        public string Number { get; set; } = "";
        public string Name { get; set; } = "";
        public string Direction { get; set; } = "Out";
        public int Seconds { get; set; }
        public bool Muted { get; set; }
        public bool Held { get; set; }
        public bool Recording { get; set; }
        public bool Video { get; set; }
        public bool Logged { get; set; }
        public string RecordingPath { get; set; } = "";
        public Timer? Clock { get; set; }
    }
}
