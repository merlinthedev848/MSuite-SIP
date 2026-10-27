using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using SIPSorcery.Net;
using SIPSorcery.SIP;

namespace MerlinSip.Mobile;

public sealed partial class SipPhoneEngine
{
    private readonly ConcurrentDictionary<string, string> _subscriptionCallIds = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<uint, DateTime> _senderReports = new();
    private Timer? _blfRefresh;
    private IPEndPoint? _pbx;
    private string? _publishCallId;
    private string? _publishTag;
    private string? _notifyCallId;
    private string? _notifyTag;
    private string? _pendingFeatureDial;
    private int _blfGeneration;
    private int _publishCseq = 1;
    private int _notifyCseq = 1;
    private int _subscribeCseq = 1;
    private string _publishEtag = "";
    private double _measuredLatencyMs;
    private double _measuredJitterMs;
    private double _measuredLossPercent;
    private bool _qualitySample;

    public void SetPresence(string status)
    {
        if (status is not ("Available" or "Busy" or "DND"))
        {
            return;
        }

        var previous = PhoneData.SelectedPresence;
        PhoneData.SetSelectedPresence(status);
        PhoneSession.Current.SetNotice(status == "DND" ? "Do not disturb is on." : "Presence set to " + status + ".");
        PhoneSession.Current.TouchLists();
        _ = Task.Run(() => PublishPresenceAsync(status));

        var declineIncoming = status == "DND" && PhoneSession.Current.Phase == PhonePhase.Incoming;
        if (status == "DND")
        {
            QueueFeatureDial(DeskPhone.DndOn, "Do not disturb is on. *74 is sent when the line is idle.");
        }
        else if (previous == "DND")
        {
            QueueFeatureDial(DeskPhone.DndOff, "Do not disturb is off. *074 is sent when the line is idle.");
        }

        if (declineIncoming)
        {
            Decline();
        }
    }

    public void Voicemail() => DialIdleFeature(DeskPhone.Voicemail, "Voicemail is dialled when the phone is idle.");

    public void GroupPickup() => DialIdleFeature(DeskPhone.GroupPickup, "Group pickup is used when the phone is idle.");

    public void Intercom(string number)
    {
        if (PhoneSession.Current.HasLiveCall)
        {
            PhoneSession.Current.SetNotice("Intercom is used when the phone is idle.");
            return;
        }

        var extension = DeskPhone.Digits(number);
        if (extension.Length == 0)
        {
            PhoneSession.Current.SetNotice("Enter an extension, then press Intercom.");
            return;
        }

        DialStaged(DeskPhone.IntercomTo(extension));
    }

    public void ForwardAll(string number)
    {
        if (PhoneSession.Current.HasLiveCall)
        {
            PhoneSession.Current.SetNotice("Call forward is set when the phone is idle.");
            return;
        }

        DialStaged(DeskPhone.ForwardAllTo(number));
    }

    public void Redial()
    {
        var last = PhoneData.LastOutbound();
        if (last == null)
        {
            PhoneSession.Current.SetNotice("There is no number to redial.");
            return;
        }

        DialIdleFeature(last.Number, "Redial is used when the phone is idle.");
    }

    public void Park() => SendInCallCode(DeskPhone.Park, "Park is used during a call. The PBX announces the parking slot.", "Park code *6 sent. Listen for the parking slot, then dial that slot from another phone.");

    public void Record() => SendInCallCode(DeskPhone.OneTouchRecord, "One-touch record is sent during a call.", "Record code *1 sent.");

    public void RefreshBlf()
    {
        var generation = Interlocked.Increment(ref _blfGeneration);
        _ = Task.Run(() => SubscribeAllAsync(generation));
    }

    private void OnRegistered()
    {
        if (_blfRefresh == null)
        {
            _blfRefresh = new Timer(_ =>
            {
                if (_registration?.IsRegistered == true)
                {
                    RefreshBlf();
                }
            }, null, TimeSpan.FromMinutes(30), TimeSpan.FromMinutes(30));
            RefreshBlf();
        }

        if (BlfState.IsBusyOrDnd(PhoneData.SelectedPresence))
        {
            _ = Task.Run(() => PublishPresenceAsync(PhoneData.SelectedPresence));
        }
    }

    private void StopBlf()
    {
        Interlocked.Increment(ref _blfGeneration);
        _blfRefresh?.Dispose();
        _blfRefresh = null;
        _pbx = null;
        _publishEtag = "";
        _pendingFeatureDial = null;
        _subscriptionCallIds.Clear();
        BlfBook.Clear();
    }

    private void NoteBlf(SIPRequest request)
    {
        var callId = request.Header?.CallId ?? "";
        _subscriptionCallIds.TryGetValue(callId, out var extension);
        BlfBook.ApplyMessage(extension, request.Body, request.Header?.Event);
    }

    private void DialIdleFeature(string number, string busyMessage)
    {
        if (PhoneSession.Current.HasLiveCall)
        {
            PhoneSession.Current.SetNotice(busyMessage);
            return;
        }

        DialStaged(number);
    }

    private void DialStaged(string number)
    {
        if (_userAgent == null || _account == null || _registration?.IsRegistered != true)
        {
            PhoneSession.Current.SetNotice("Register the SIP account before dialling.");
            return;
        }

        PhoneSession.Current.StageNumber(number);
        Dial(number);
    }

    private void QueueFeatureDial(string number, string waitingMessage)
    {
        if (PhoneSession.Current.HasLiveCall)
        {
            _pendingFeatureDial = number;
            PhoneSession.Current.SetNotice(waitingMessage);
            return;
        }

        _pendingFeatureDial = null;
        DialStaged(number);
    }

    private void DrainPendingFeatureDial()
    {
        if (PhoneSession.Current.HasLiveCall || string.IsNullOrEmpty(_pendingFeatureDial))
        {
            return;
        }

        var number = _pendingFeatureDial;
        _pendingFeatureDial = null;
        DialStaged(number);
    }

    private void SendInCallCode(string code, string idleMessage, string sentMessage)
    {
        if (PhoneSession.Current.Phase != PhonePhase.InCall || _userAgent == null)
        {
            PhoneSession.Current.SetNotice(idleMessage);
            return;
        }

        _ = SendFeatureDtmfAsync(code, sentMessage);
    }

    private async Task SendFeatureDtmfAsync(string code, string sentMessage)
    {
        foreach (var digit in DeskPhone.DtmfDigits(code))
        {
            if (PhoneSession.Current.Phase != PhonePhase.InCall)
            {
                return;
            }

            SendDigit(digit);
            await Task.Delay(180);
        }

        if (PhoneSession.Current.Phase == PhonePhase.InCall)
        {
            PhoneSession.Current.SetNotice(sentMessage);
        }
    }

    private async Task SubscribeAllAsync(int generation)
    {
        if (generation != _blfGeneration || _registration?.IsRegistered != true)
        {
            return;
        }

        try
        {
            await ProxyAsync();
            var tasks = BlfTargets().Select(extension => SubscribeExtensionAsync(extension, generation));
            await Task.WhenAll(tasks);
        }
        catch
        {
            // A failed lamp subscription leaves that extension offline.
        }
    }

    private IEnumerable<string> BlfTargets()
    {
        var numbers = PhoneData.Contacts.Select(contact => BlfState.Normalize(contact.Number));
        var own = BlfState.Normalize(_account?.Extension);
        if (own.Length > 0)
        {
            numbers = numbers.Append(own);
        }

        return numbers
            .Where(value => value.Length is > 0 and <= 10)
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private async Task SubscribeExtensionAsync(string extension, int generation)
    {
        await SendSubscribeAsync(extension, "dialog", "application/dialog-info+xml", generation);
        await SendSubscribeAsync(extension, "presence", "application/pidf+xml", generation);
    }

    private async Task SendSubscribeAsync(string extension, string eventName, string accept, int generation)
    {
        if (generation != _blfGeneration || _account == null)
        {
            return;
        }

        var callId = Guid.NewGuid().ToString("N");
        var tag = Guid.NewGuid().ToString("N")[..12];
        _subscriptionCallIds[callId] = extension;
        var request = BuildCommand(
            SIPMethodsEnum.SUBSCRIBE,
            extension,
            callId,
            tag,
            Interlocked.Increment(ref _subscribeCseq),
            eventName,
            accept,
            3600,
            null,
            null,
            null,
            false);
        if (request == null || generation != _blfGeneration)
        {
            return;
        }

        await TransmitAsync(request);
    }

    private async Task PublishPresenceAsync(string status)
    {
        var account = _account;
        if (account == null || _registration?.IsRegistered != true)
        {
            return;
        }

        try
        {
            _publishCallId ??= Guid.NewGuid().ToString("N");
            _publishTag ??= Guid.NewGuid().ToString("N")[..12];
            await ProxyAsync();
            var body = BuildPresenceBody(account, status);
            var expires = status.Equals("Offline", StringComparison.OrdinalIgnoreCase) ? 0 : 3600;
            var response = await TransmitAsync(BuildCommand(
                SIPMethodsEnum.PUBLISH,
                account.Extension.Trim(),
                _publishCallId,
                _publishTag,
                Interlocked.Increment(ref _publishCseq),
                "presence",
                null,
                expires,
                null,
                "application/pidf+xml",
                body,
                true));
            if (response?.StatusCode == 412)
            {
                _publishEtag = "";
                response = await TransmitAsync(BuildCommand(
                    SIPMethodsEnum.PUBLISH,
                    account.Extension.Trim(),
                    _publishCallId,
                    _publishTag,
                    Interlocked.Increment(ref _publishCseq),
                    "presence",
                    null,
                    expires,
                    null,
                    "application/pidf+xml",
                    body,
                    false));
            }

            if (response?.StatusCode is >= 200 and < 300 && !string.IsNullOrWhiteSpace(response.Header?.ETag))
            {
                _publishEtag = response.Header.ETag.Trim().Trim('"');
            }

            if (BlfState.IsBusyOrDnd(status))
            {
                await SendDialogNotifyAsync(true);
            }
            else if (status.Equals("Available", StringComparison.OrdinalIgnoreCase))
            {
                await SendDialogNotifyAsync(false);
            }
        }
        catch
        {
            // Presence is retried after the next successful registration while Busy or DND stays selected.
        }
    }

    private async Task SendDialogNotifyAsync(bool offHook)
    {
        var account = _account;
        if (account == null || _registration?.IsRegistered != true)
        {
            return;
        }

        _notifyCallId ??= Guid.NewGuid().ToString("N");
        _notifyTag ??= Guid.NewGuid().ToString("N")[..12];
        var subscriptionState = offHook ? "active;expires=3600" : "terminated;reason=noresource";
        var request = BuildCommand(
            SIPMethodsEnum.NOTIFY,
            account.Extension.Trim(),
            _notifyCallId,
            _notifyTag,
            Interlocked.Increment(ref _notifyCseq),
            "dialog",
            null,
            null,
            subscriptionState,
            "application/dialog-info+xml",
            BuildDialogBody(account, offHook),
            false);
        if (request != null)
        {
            await TransmitAsync(request);
        }
    }

    private SIPRequest? BuildCommand(
        SIPMethodsEnum method,
        string user,
        string callId,
        string tag,
        int cseq,
        string? eventName,
        string? accept,
        int? expires,
        string? subscriptionState,
        string? contentType,
        string? body,
        bool matchEtag)
    {
        var account = _account;
        if (account == null || string.IsNullOrWhiteSpace(user))
        {
            return null;
        }

        var domain = account.ResolvedDomain;
        var target = SIPURI.ParseSIPURI($"sip:{user}@{domain}");
        var fromUri = SIPURI.ParseSIPURI($"sip:{account.Extension.Trim()}@{domain}");
        var request = SIPRequest.GetRequest(
            method,
            target,
            new SIPToHeader(null, target, null),
            new SIPFromHeader(account.DisplayName ?? "", fromUri, tag));
        request.Header.CallId = callId;
        request.Header.CSeq = cseq;
        request.Header.CSeqMethod = method;
        request.Header.UserAgent = "CK Media Services Merlin SIP";
        request.Header.Contact = [new SIPContactHeader(account.Extension.Trim(), ContactUri())];
        if (!string.IsNullOrEmpty(eventName))
        {
            request.Header.Event = eventName;
        }

        if (!string.IsNullOrEmpty(accept))
        {
            request.Header.Accept = accept;
        }

        if (expires.HasValue)
        {
            request.Header.Expires = expires.Value;
        }

        if (!string.IsNullOrEmpty(subscriptionState))
        {
            request.Header.SubscriptionState = subscriptionState;
        }

        if (!string.IsNullOrEmpty(contentType))
        {
            request.Header.ContentType = contentType;
            request.Body = body ?? "";
            request.Header.ContentLength = Encoding.UTF8.GetByteCount(request.Body);
        }
        else
        {
            request.Header.ContentLength = 0;
        }

        if (matchEtag && !string.IsNullOrEmpty(_publishEtag))
        {
            request.Header.UnknownHeaders ??= [];
            request.Header.UnknownHeaders.Add("SIP-If-Match: " + _publishEtag);
        }

        return request;
    }

    private async Task<SIPResponse?> TransmitAsync(SIPRequest? request)
    {
        if (request == null)
        {
            return null;
        }

        var response = await SendOnceAsync(request);
        var account = _account;
        if (response == null || account == null)
        {
            return response;
        }

        if (response.Status is not (SIPResponseStatusCodesEnum.Unauthorised or SIPResponseStatusCodesEnum.ProxyAuthenticationRequired))
        {
            return response;
        }

        if (response.Header?.AuthenticationHeaders is not { Count: > 0 } challenges)
        {
            return response;
        }

                var pwd = account.Password?.Trim() ?? "";
        var isMd5 = pwd.Length == 32 && pwd.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));
        var authenticated = isMd5
            ? request.DuplicateAndAuthenticate(challenges, account.AuthUsername, new SIPSorcery.SIP.GetHA1DigestDelegate((username, realm, algo) => pwd.ToLowerInvariant()))
            : request.DuplicateAndAuthenticate(challenges, account.AuthUsername, account.Password);
        return await SendOnceAsync(authenticated);
    }

    private async Task<SIPResponse?> SendOnceAsync(SIPRequest request)
    {
        var transport = _transport;
        if (transport == null)
        {
            return null;
        }

        var proxy = await ProxyAsync();
        var done = new TaskCompletionSource<SIPResponse?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var transaction = new SIPNonInviteTransaction(transport, request, proxy);
        transaction.NonInviteTransactionFinalResponseReceived += (_, _, _, response) =>
        {
            done.TrySetResult(response);
            return Task.FromResult(SocketError.Success);
        };
        transaction.NonInviteTransactionFailed += (_, _) => done.TrySetResult(null);
        try
        {
            transaction.SendRequest();
        }
        catch
        {
            return null;
        }

        var finished = await Task.WhenAny(done.Task, Task.Delay(8000));
        return finished == done.Task ? await done.Task : null;
    }

    private async Task<SIPEndPoint?> ProxyAsync()
    {
        var account = _account;
        if (account == null)
        {
            return null;
        }

        if (_pbx == null)
        {
            var host = account.Server.Trim();
            IPAddress address;
            if (!IPAddress.TryParse(host, out address!))
            {
                var addresses = await Dns.GetHostAddressesAsync(host);
                address = addresses.FirstOrDefault(item => item.AddressFamily == AddressFamily.InterNetwork) ?? addresses[0];
            }

            var port = account.Port is > 0 and <= 65535 ? account.Port : 5060;
            _pbx = new IPEndPoint(address, port);
        }

        return new SIPEndPoint(SIPProtocolsEnum.udp, _pbx);
    }

    private SIPURI ContactUri()
    {
        var account = _account!;
        var port = _transport?.GetSIPChannels().FirstOrDefault()?.Port ?? 0;
        var host = account.ResolvedDomain;
        if (_pbx != null)
        {
            try
            {
                using var probe = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
                probe.Connect(_pbx);
                if (probe.LocalEndPoint is IPEndPoint local)
                {
                    host = local.Address.ToString();
                }
            }
            catch
            {
                host = account.ResolvedDomain;
            }
        }

        var portText = port > 0 ? ":" + port : "";
        return SIPURI.ParseSIPURI($"sip:{account.Extension.Trim()}@{host}{portText}");
    }

    private static string BuildPresenceBody(SipAccount account, string status)
    {
        var extension = Xml(account.Extension.Trim());
        var domain = Xml(account.ResolvedDomain);
        var offline = status.Equals("Offline", StringComparison.OrdinalIgnoreCase) ||
                      status.Equals("Appear Offline", StringComparison.OrdinalIgnoreCase);
        var basic = offline ? "closed" : "open";
        var note = Xml(BlfState.PresenceNote(status));
        var activity = status.ToLowerInvariant() switch
        {
            "away" or "appear away" => "      <rpid:away/>\n",
            "dnd" or "do not disturb" => "      <rpid:do-not-disturb/>\n      <rpid:on-the-phone/>\n",
            "busy" => "      <rpid:busy/>\n      <rpid:on-the-phone/>\n",
            "available" => "      <rpid:available/>\n",
            _ => ""
        };
        var person = activity.Length == 0
            ? ""
            : "  <dm:person id=\"p_" + extension + "\">\n    <rpid:activities>\n" + activity + "    </rpid:activities>\n    <dm:note>" + note + "</dm:note>\n  </dm:person>\n";
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<presence xmlns=\"urn:ietf:params:xml:ns:pidf\"\n"
            + "          xmlns:dm=\"urn:ietf:params:xml:ns:pidf:data-model\"\n"
            + "          xmlns:rpid=\"urn:ietf:params:xml:ns:pidf:rpid\"\n"
            + "          entity=\"sip:" + extension + "@" + domain + "\">\n"
            + "  <tuple id=\"" + extension + "\">\n"
            + "    <status>\n"
            + "      <basic>" + basic + "</basic>\n"
            + "    </status>\n"
            + "    <note>" + note + "</note>\n"
            + "  </tuple>\n"
            + person
            + "</presence>";
    }

    private static string BuildDialogBody(SipAccount account, bool offHook)
    {
        var extension = Xml(account.Extension.Trim());
        var domain = Xml(account.ResolvedDomain);
        var state = offHook ? "confirmed" : "terminated";
        var note = offHook ? BlfState.BusyHere : "Phone is on the hook and available";
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<dialog-info xmlns=\"urn:ietf:params:xml:ns:dialog-info\" version=\"1\" state=\"full\"\n"
            + "             entity=\"sip:" + extension + "@" + domain + "\">\n"
            + "  <dialog id=\"" + extension + "_offhook\" direction=\"recipient\">\n"
            + "    <state>" + state + "</state>\n"
            + "    <notes>" + note + "</notes>\n"
            + "  </dialog>\n"
            + "</dialog-info>";
    }

    private static string Xml(string value) =>
        value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    private void WatchCallQuality(SIPSorcery.Media.VoIPMediaSession session)
    {
        _measuredLatencyMs = 0;
        _measuredJitterMs = 0;
        _measuredLossPercent = 0;
        _qualitySample = false;
        lock (_senderReports)
        {
            _senderReports.Clear();
        }

        session.OnSendReport += (_, packet) =>
        {
            var report = packet?.SenderReport;
            if (report == null || report.NtpTimestamp == 0)
            {
                return;
            }

            var lsr = (uint)(report.NtpTimestamp >> 16);
            lock (_senderReports)
            {
                _senderReports[lsr] = DateTime.UtcNow;
            }
        };

        session.OnReceiveReport += (_, _, packet) =>
        {
            var reports = packet?.ReceiverReport?.ReceptionReports;
            if (reports == null)
            {
                return;
            }

            foreach (var sample in reports)
            {
                if (sample.LastSenderReportTimestamp == 0 || sample.DelaySinceLastSenderReport == 0)
                {
                    continue;
                }

                DateTime sent;
                lock (_senderReports)
                {
                    if (!_senderReports.TryGetValue(sample.LastSenderReportTimestamp, out sent))
                    {
                        continue;
                    }
                }

                var latencyMs = (DateTime.UtcNow - sent).TotalMilliseconds - (sample.DelaySinceLastSenderReport / 65536.0 * 1000.0);
                if (latencyMs <= 0 || latencyMs > 10000 || double.IsNaN(latencyMs))
                {
                    continue;
                }

                _measuredLatencyMs = latencyMs;
                _measuredJitterMs = sample.Jitter / 8.0;
                _measuredLossPercent = sample.FractionLost * 100.0 / 256.0;
                _qualitySample = true;
                PublishQuality();
            }
        };

        PublishQuality();
    }

    private void PublishQuality()
    {
        var packets = _audio?.ReceivedPackets ?? 0;
        var text = packets > 0 && _qualitySample && _measuredLatencyMs > 0
            ? $"Latency {_measuredLatencyMs:0} ms · jitter {_measuredJitterMs:0.0} ms · loss {_measuredLossPercent:0.0}%"
            : "Not measured";
        PhoneSession.Current.SetCallQuality(text);
    }
}
