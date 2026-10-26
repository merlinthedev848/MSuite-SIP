using System.Net;
using Android.Content;
using Android.Media;
using Android.OS;
using SIPSorcery.Media;
using SIPSorcery.Net;
using SIPSorcery.SIP;
using SIPSorcery.SIP.App;

namespace MerlinSip.Mobile;

public sealed class SipPhoneEngine
{
    private readonly object _gate = new();
    private readonly Context _context;
    private SIPTransport? _transport;
    private SIPRegistrationUserAgent? _registration;
    private SIPUserAgent? _userAgent;
    private SIPServerUserAgent? _incoming;
    private VoIPMediaSession? _media;
    private AndroidAudioEndPoint? _audio;
    private AudioManager? _audioManager;
    private Ringtone? _ringtone;
    private ToneGenerator? _tones;
    private PowerManager.WakeLock? _wakeLock;
    private Timer? _clock;
    private Timer? _retry;
    private SipAccount? _account;
    private string _callNumber = "";
    private string _callDirection = "Out";
    private bool _callLogged;
    private int _callSeconds;
    private bool _started;

    public SipPhoneEngine(Context context)
    {
        _context = context.ApplicationContext!;
        _audioManager = (AudioManager?)_context.GetSystemService(Context.AudioService);
    }

    public void Start()
    {
        lock (_gate)
        {
            if (_started)
            {
                return;
            }

            _started = true;
        }

        var directory = _context.FilesDir?.AbsolutePath ?? Path.GetTempPath();
        PhoneData.Load(directory);
        if (PhoneData.Account != null)
        {
            Register(PhoneData.Account);
        }
        else
        {
            PhoneSession.Current.SetStatus(PhonePhase.Offline, "Offline", "Enter your SIP account to register.");
        }
    }

    public void Register(SipAccount account)
    {
        _account = account;
        PhoneData.SaveAccount(account);
        PhoneSession.Current.SetStatus(PhonePhase.Registering, "Registering…", "Contacting " + account.Server);
        _ = Task.Run(OpenRegistration);
    }

    public void Unregister()
    {
        _retry?.Dispose();
        _retry = null;
        _account = null;
        PhoneData.ClearAccount();
        TearDownSignalling();
        PhoneSession.Current.SetStatus(PhonePhase.Offline, "Offline", "Signed out.");
        SipForegroundService.Publish("Signed out", false);
    }

    public void Dial(string number)
    {
        _ = Task.Run(() => DialCore(number));
    }

    public void Answer()
    {
        _ = Task.Run(AnswerCore);
    }

    public void Decline()
    {
        StopRinging();
        SIPServerUserAgent? incoming;
        lock (_gate)
        {
            incoming = _incoming;
            _incoming = null;
        }

        try
        {
            incoming?.Reject(SIPResponseStatusCodesEnum.Decline, "Declined");
        }
        catch
        {
            // The caller may already have cancelled.
        }

        FinishCall("Declined");
    }

    public void Hangup()
    {
        var phase = PhoneSession.Current.Phase;
        try
        {
            if (phase == PhonePhase.Outgoing)
            {
                _userAgent?.Cancel();
            }
            else
            {
                _userAgent?.Hangup();
            }
        }
        catch
        {
            // The dialog may already be gone.
        }

        if (phase == PhonePhase.Incoming)
        {
            Decline();
            return;
        }

        FinishCall(phase == PhonePhase.InCall ? "Answered" : "Cancelled");
    }

    public void SendDigit(char digit)
    {
        PlayTone(digit);
        if (PhoneSession.Current.Phase is not (PhonePhase.InCall or PhonePhase.Outgoing))
        {
            return;
        }

        var tone = digit switch
        {
            >= '0' and <= '9' => (byte)(digit - '0'),
            '*' => (byte)10,
            '#' => (byte)11,
            _ => byte.MaxValue
        };
        if (tone == byte.MaxValue || _userAgent == null)
        {
            return;
        }

        _ = _userAgent.SendDtmf(tone);
    }

    public void SetMuted(bool muted)
    {
        if (_audio != null)
        {
            _audio.Muted = muted;
        }

        PhoneSession.Current.SetCallFlags(muted: muted);
    }

    public void SetSpeaker(bool speaker)
    {
        ApplyRoute(speaker);
        PhoneSession.Current.SetCallFlags(speaker: speaker);
    }

    public void SetHold(bool hold)
    {
        _ = Task.Run(() =>
        {
            try
            {
                if (_userAgent == null)
                {
                    return;
                }

                if (hold)
                {
                    _userAgent.PutOnHold();
                }
                else
                {
                    _userAgent.TakeOffHold();
                }

                PhoneSession.Current.SetCallFlags(hold: hold);
            }
            catch (Exception ex)
            {
                PhoneSession.Current.SetStatus(PhoneSession.Current.Phase, PhoneSession.Current.Status, ex.Message);
            }
        });
    }

    private void OpenRegistration()
    {
        var account = _account;
        if (account == null)
        {
            return;
        }

        try
        {
            TearDownSignalling();
            _transport = new SIPTransport();
            _transport.AddSIPChannel(new SIPUDPChannel(new IPEndPoint(IPAddress.Any, 0)));
            _transport.SIPTransportRequestReceived += OnSipRequest;
            _userAgent = new SIPUserAgent(_transport, null, false);
            WireUserAgent(_userAgent);

            var aor = SIPURI.ParseSIPURI($"sip:{account.Extension.Trim()}@{account.ResolvedDomain}");
            var registrar = account.Port > 0 && account.Port != 5060
                ? $"{account.Server}:{account.Port}"
                : account.Server;
            _registration = new SIPRegistrationUserAgent(
                _transport,
                null,
                aor,
                account.AuthUsername,
                account.Password,
                null,
                registrar,
                null,
                180,
                null,
                15,
                20,
                3,
                false);
            _registration.RegistrationSuccessful += (_, _) =>
            {
                PhoneSession.Current.SetStatus(PhonePhase.Registered, "Registered", "Ready on extension " + account.Extension);
                SipForegroundService.Publish("Registered · " + account.Extension, false);
            };
            _registration.RegistrationFailed += (_, response, message) =>
                FailRegistration(response, message);
            _registration.RegistrationTemporaryFailure += (_, response, message) =>
                FailRegistration(response, message);
            _registration.RegistrationRemoved += (_, _) =>
            {
                if (!PhoneSession.Current.HasLiveCall)
                {
                    PhoneSession.Current.SetStatus(PhonePhase.Offline, "Offline", "Registration removed.");
                }
            };
            _registration.Start();
        }
        catch (Exception ex)
        {
            PhoneSession.Current.SetStatus(PhonePhase.Offline, "Offline", ex.Message);
            ScheduleRetry();
        }
    }

    private Task OnSipRequest(SIPEndPoint local, SIPEndPoint remote, SIPRequest request)
    {
        if (request.Method is SIPMethodsEnum.OPTIONS or SIPMethodsEnum.NOTIFY)
        {
            var response = SIPResponse.GetResponse(request, SIPResponseStatusCodesEnum.Ok, null);
            if (_transport != null)
            {
                _ = _transport.SendResponseAsync(response);
            }
        }

        return Task.CompletedTask;
    }

    private void WireUserAgent(SIPUserAgent userAgent)
    {
        userAgent.OnIncomingCall += (_, request) =>
        {
            if (PhoneSession.Current.HasLiveCall)
            {
                var busy = userAgent.AcceptCall(request);
                busy.Reject(SIPResponseStatusCodesEnum.BusyHere, "Busy");
                return;
            }

            var incoming = userAgent.AcceptCall(request);
            try
            {
                incoming.Progress(SIPResponseStatusCodesEnum.Ringing, null, null, null, null);
            }
            catch
            {
                // Ringing is best-effort if the transaction already moved on.
            }

            lock (_gate)
            {
                _incoming = incoming;
            }

            var user = request.Header.From.FromURI.User ?? "Unknown";
            var name = request.Header.From.FromName?.Trim().Trim('"');
            var display = string.IsNullOrWhiteSpace(name) ? user : name + " · " + user;
            BeginCall(user, "In");
            PhoneSession.Current.SetStatus(PhonePhase.Incoming, "Incoming", "Incoming call", display);
            StartRinging();
            SipForegroundService.Publish("Incoming · " + display, false, incoming: true);
        };

        userAgent.ClientCallTrying += (_, _) =>
            PhoneSession.Current.SetStatus(PhonePhase.Outgoing, "Calling…", null, _callNumber);
        userAgent.ClientCallRinging += (_, _) =>
            PhoneSession.Current.SetStatus(PhonePhase.Outgoing, "Ringing", null, _callNumber);
        userAgent.ClientCallAnswered += (_, _) => MarkConnected();
        userAgent.ClientCallFailed += (_, error, _) =>
        {
            PhoneSession.Current.SetStatus(
                _registration?.IsRegistered == true ? PhonePhase.Registered : PhonePhase.Offline,
                _registration?.IsRegistered == true ? "Registered" : "Offline",
                string.IsNullOrWhiteSpace(error) ? "Call failed." : error);
            FinishCall("Failed");
        };
        userAgent.ServerCallCancelled += (_, _) =>
        {
            StopRinging();
            FinishCall("Missed");
        };
        userAgent.OnCallHungup += _ =>
        {
            StopRinging();
            var phase = PhoneSession.Current.Phase;
            FinishCall(phase == PhonePhase.InCall ? "Answered" : phase == PhonePhase.Incoming ? "Missed" : "Cancelled");
        };
    }

    private async Task DialCore(string number)
    {
        if (_userAgent == null || _account == null || _registration?.IsRegistered != true)
        {
            PhoneSession.Current.SetStatus(PhoneSession.Current.Phase, PhoneSession.Current.Status, "Register the SIP account before dialling.");
            return;
        }

        if (PhoneSession.Current.HasLiveCall)
        {
            return;
        }

        BeginCall(number, "Out");
        PhoneSession.Current.SetStatus(PhonePhase.Outgoing, "Calling…", "Calling " + number, number);
        SipForegroundService.Publish("Calling " + number, true);
        try
        {
            var media = CreateMedia();
            var account = _account;
            var descriptor = new SIPCallDescriptor(
                account.Extension.Trim(),
                account.Password,
                $"sip:{number}@{account.ResolvedDomain}",
                $"sip:{account.Extension.Trim()}@{account.ResolvedDomain}",
                $"sip:{number}@{account.ResolvedDomain}",
                null,
                null,
                account.AuthUsername,
                SIPCallDirection.Out,
                null,
                null,
                null);
            if (!string.IsNullOrWhiteSpace(account.DisplayName))
            {
                descriptor.FromDisplayName = account.DisplayName.Trim();
            }

            var answered = await _userAgent.Call(descriptor, media, 60);
            if (!answered && PhoneSession.Current.Phase == PhonePhase.Outgoing)
            {
                FinishCall("Failed");
                PhoneSession.Current.SetStatus(PhonePhase.Registered, "Registered", "The call was not answered.");
            }
        }
        catch (Exception ex)
        {
            FinishCall("Failed");
            PhoneSession.Current.SetStatus(PhonePhase.Registered, "Registered", ex.Message);
        }
    }

    private async Task AnswerCore()
    {
        SIPServerUserAgent? incoming;
        lock (_gate)
        {
            incoming = _incoming;
            _incoming = null;
        }

        if (incoming == null || _userAgent == null)
        {
            return;
        }

        StopRinging();
        try
        {
            var media = CreateMedia();
            var answered = await _userAgent.Answer(incoming, media, null);
            if (answered)
            {
                MarkConnected();
            }
            else
            {
                FinishCall("Failed");
                PhoneSession.Current.SetStatus(PhonePhase.Registered, "Registered", "The call could not be answered.");
            }
        }
        catch (Exception ex)
        {
            FinishCall("Failed");
            PhoneSession.Current.SetStatus(PhonePhase.Registered, "Registered", ex.Message);
        }
    }

    private VoIPMediaSession CreateMedia()
    {
        CloseMedia();
        AcquireWakeLock();
        ApplyRoute(PhoneSession.Current.SpeakerOn);
        var audio = new AndroidAudioEndPoint(_context, new SIPSorcery.Media.AudioEncoder());
        audio.RestrictFormats(format => format.Codec is SIPSorceryMedia.Abstractions.AudioCodecsEnum.PCMU or SIPSorceryMedia.Abstractions.AudioCodecsEnum.PCMA);
        audio.Muted = PhoneSession.Current.Muted;
        var session = new VoIPMediaSession(new SIPSorceryMedia.Abstractions.MediaEndPoints
        {
            AudioSource = audio,
            AudioSink = audio
        }, null!);
        session.AcceptRtpFromAny = true;
        _audio = audio;
        _media = session;
        return session;
    }

    private void MarkConnected()
    {
        StopRinging();
        ApplyRoute(PhoneSession.Current.SpeakerOn);
        PhoneSession.Current.SetStatus(PhonePhase.InCall, "In call", "Connected", _callNumber);
        SipForegroundService.Publish("In call · " + _callNumber, true);
        _clock?.Dispose();
        _clock = new Timer(_ =>
        {
            _callSeconds++;
            PhoneSession.Current.Tick();
        }, null, 1000, 1000);
    }

    private void BeginCall(string number, string direction)
    {
        _callNumber = number;
        _callDirection = direction;
        _callLogged = false;
        _callSeconds = 0;
    }

    private void FinishCall(string result)
    {
        if (_callLogged || string.IsNullOrWhiteSpace(_callNumber))
        {
            CloseMedia();
            RestoreRegisteredStatus();
            return;
        }

        _callLogged = true;
        _clock?.Dispose();
        _clock = null;
        StopRinging();
        PhoneData.AddHistory(new CallRecord
        {
            Number = _callNumber,
            Direction = _callDirection,
            Result = result,
            At = DateTimeOffset.Now,
            Seconds = result == "Answered" ? _callSeconds : 0
        });
        _callNumber = "";
        CloseMedia();
        ReleaseWakeLock();
        PhoneSession.Current.TouchLists();
        RestoreRegisteredStatus();
        SipForegroundService.Publish(
            _registration?.IsRegistered == true ? "Registered · " + _account?.Extension : "Merlin SIP",
            false);
        SipForegroundService.ClearIncoming();
    }

    private void RestoreRegisteredStatus()
    {
        if (PhoneSession.Current.HasLiveCall)
        {
            return;
        }

        if (_registration?.IsRegistered == true)
        {
            PhoneSession.Current.SetStatus(PhonePhase.Registered, "Registered", "Ready on extension " + _account?.Extension);
        }
    }

    private void FailRegistration(SIPResponse? response, string message)
    {
        var reason = string.IsNullOrWhiteSpace(message)
            ? response == null ? "Registration failed." : $"{(int)response.StatusCode} {response.ReasonPhrase}"
            : message;
        if (!PhoneSession.Current.HasLiveCall)
        {
            PhoneSession.Current.SetStatus(PhonePhase.Offline, "Not registered", reason);
        }

        SipForegroundService.Publish("Not registered", false);
        ScheduleRetry();
    }

    private void ScheduleRetry()
    {
        _retry?.Dispose();
        _retry = new Timer(_ =>
        {
            if (_account != null && _registration?.IsRegistered != true && !PhoneSession.Current.HasLiveCall)
            {
                PhoneSession.Current.SetStatus(PhonePhase.Registering, "Registering…", "Trying again…");
                OpenRegistration();
            }
        }, null, TimeSpan.FromSeconds(30), Timeout.InfiniteTimeSpan);
    }

    private void TearDownSignalling()
    {
        StopRinging();
        CloseMedia();
        try
        {
            _userAgent?.Hangup();
        }
        catch
        {
            // Nothing to hang up.
        }

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
            _userAgent?.Dispose();
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

        _incoming = null;
        _userAgent = null;
        _registration = null;
        _transport = null;
    }

    private void CloseMedia()
    {
        try
        {
            _audio?.Close();
        }
        catch
        {
            // The devices may already be released.
        }

        try
        {
            _media?.Dispose();
        }
        catch
        {
            // The RTP session may already be closed.
        }

        _audio = null;
        _media = null;
        if (_audioManager != null)
        {
            _audioManager.Mode = Mode.Normal;
            if (OperatingSystem.IsAndroidVersionAtLeast(31))
            {
                _audioManager.ClearCommunicationDevice();
            }
        }
    }

    private void ApplyRoute(bool speaker)
    {
        if (_audioManager == null)
        {
            return;
        }

        _audioManager.Mode = Mode.InCommunication;
        if (OperatingSystem.IsAndroidVersionAtLeast(31))
        {
            AudioDeviceInfo? match = null;
            var devices = _audioManager.AvailableCommunicationDevices;
            if (devices != null)
            {
                foreach (var device in devices)
                {
                    if (speaker && device.Type == AudioDeviceType.BuiltinSpeaker)
                    {
                        match = device;
                    }
                    else if (!speaker && device.Type == AudioDeviceType.BuiltinEarpiece)
                    {
                        match = device;
                    }
                }
            }

            if (match != null)
            {
                _audioManager.SetCommunicationDevice(match);
                return;
            }
        }

#pragma warning disable CA1422
        _audioManager.SpeakerphoneOn = speaker;
#pragma warning restore CA1422
    }

    private void StartRinging()
    {
        PhoneSession.Current.Post(() =>
        {
            if (PhoneSession.Current.UiVisible)
            {
                try
                {
                    StopRinging();
                    var uri = RingtoneManager.GetDefaultUri(RingtoneType.Ringtone);
                    _ringtone = RingtoneManager.GetRingtone(_context, uri);
                    _ringtone?.Play();
                }
                catch
                {
                    // A missing ringtone should not block the call.
                }
            }

            try
            {
                var vibrator = Vibrator();
                vibrator?.Vibrate(VibrationEffect.CreateWaveform(new long[] { 0, 350, 500 }, 0));
            }
            catch
            {
                // Vibration is optional.
            }
        });
    }

    private void StopRinging()
    {
        try
        {
            _ringtone?.Stop();
            _ringtone = null;
        }
        catch
        {
            // Already stopped.
        }

        try
        {
            var vibrator = Vibrator();
            vibrator?.Cancel();
        }
        catch
        {
            // Already cancelled.
        }
    }

    private Vibrator? Vibrator()
    {
        if (OperatingSystem.IsAndroidVersionAtLeast(31))
        {
            var manager = (VibratorManager?)_context.GetSystemService(Context.VibratorManagerService);
            return manager?.DefaultVibrator;
        }

#pragma warning disable CA1422
        return (Vibrator?)_context.GetSystemService(Context.VibratorService);
#pragma warning restore CA1422
    }

    private void PlayTone(char digit)
    {
        var tone = digit switch
        {
            '0' => Tone.Dtmf0,
            '1' => Tone.Dtmf1,
            '2' => Tone.Dtmf2,
            '3' => Tone.Dtmf3,
            '4' => Tone.Dtmf4,
            '5' => Tone.Dtmf5,
            '6' => Tone.Dtmf6,
            '7' => Tone.Dtmf7,
            '8' => Tone.Dtmf8,
            '9' => Tone.Dtmf9,
            '*' => Tone.DtmfS,
            '#' => Tone.DtmfP,
            _ => (Tone?)null
        };
        if (tone == null)
        {
            return;
        }

        try
        {
            _tones ??= new ToneGenerator(global::Android.Media.Stream.Music, 80);
            _tones.StartTone(tone.Value, 120);
        }
        catch
        {
            // Local key tones are optional.
        }
    }

    private void AcquireWakeLock()
    {
        if (_wakeLock?.IsHeld == true)
        {
            return;
        }

        var power = (PowerManager?)_context.GetSystemService(Context.PowerService);
        _wakeLock = power?.NewWakeLock(WakeLockFlags.Partial, "merlinsip:call");
        _wakeLock?.Acquire();
    }

    private void ReleaseWakeLock()
    {
        if (_wakeLock?.IsHeld == true)
        {
            _wakeLock.Release();
        }

        _wakeLock = null;
    }
}

public static class PhoneRuntime
{
    private static readonly object Gate = new();
    private static SipPhoneEngine? _engine;

    public static void EnsureStarted(Context context)
    {
        lock (Gate)
        {
            if (_engine != null)
            {
                return;
            }

            _engine = new SipPhoneEngine(context);
        }

        _engine.Start();
    }

    public static void Register(SipAccount account) => _engine?.Register(account);
    public static void Unregister() => _engine?.Unregister();
    public static void Dial(string number) => _engine?.Dial(number);
    public static void Answer() => _engine?.Answer();
    public static void Decline() => _engine?.Decline();
    public static void Hangup() => _engine?.Hangup();
    public static void SendDigit(char digit) => _engine?.SendDigit(digit);
    public static void SetMuted(bool muted) => _engine?.SetMuted(muted);
    public static void SetSpeaker(bool speaker) => _engine?.SetSpeaker(speaker);
    public static void SetHold(bool hold) => _engine?.SetHold(hold);
}
