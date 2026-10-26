namespace MerlinSip.Mobile;

public enum PhonePhase
{
    Offline,
    Registering,
    Registered,
    Outgoing,
    Incoming,
    InCall
}

public sealed class PhoneSession
{
    public static PhoneSession Current { get; } = new();

    private readonly object _gate = new();
    private global::Android.OS.Handler? _handler;

    public event Action? Changed;

    public PhonePhase Phase { get; private set; } = PhonePhase.Offline;
    public string Status { get; private set; } = "Offline";
    public string Detail { get; private set; } = "Enter your SIP account to register.";
    public string Remote { get; private set; } = "";
    public int CallSeconds { get; private set; }
    public bool Muted { get; private set; }
    public bool SpeakerOn { get; private set; }
    public bool OnHold { get; private set; }
    public int Revision { get; private set; }
    public bool UiVisible { get; set; }
    public string Notice { get; private set; } = "";
    public string CallQuality { get; private set; } = "Not measured";
    public string? StagedNumber { get; private set; }

    public bool HasLiveCall => Phase is PhonePhase.Outgoing or PhonePhase.Incoming or PhonePhase.InCall;

    public string Clock
    {
        get
        {
            var time = TimeSpan.FromSeconds(Math.Max(0, CallSeconds));
            return time.TotalHours >= 1 ? time.ToString(@"h\:mm\:ss") : time.ToString(@"mm\:ss");
        }
    }

    public void Post(Action action)
    {
        var handler = Handler;
        if (global::Android.OS.Looper.MainLooper?.IsCurrentThread == true)
        {
            action();
            return;
        }

        handler.Post(action);
    }

    public void SetStatus(PhonePhase phase, string status, string? detail = null, string? remote = null)
    {
        Post(() =>
        {
            var enteredCall = Phase is not (PhonePhase.Outgoing or PhonePhase.Incoming or PhonePhase.InCall)
                && phase is PhonePhase.Outgoing or PhonePhase.Incoming;
            Phase = phase;
            Status = status;
            if (detail != null)
            {
                Detail = detail;
            }

            if (remote != null)
            {
                Remote = remote;
            }

            if (phase is PhonePhase.Offline or PhonePhase.Registering or PhonePhase.Registered || enteredCall)
            {
                CallSeconds = 0;
                Muted = false;
                SpeakerOn = false;
                OnHold = false;
            }

            if (enteredCall)
            {
                CallQuality = "Not measured";
            }

            Changed?.Invoke();
        });
    }

    public void SetNotice(string notice)
    {
        Post(() =>
        {
            Notice = notice;
            Changed?.Invoke();
        });
    }

    public void SetCallQuality(string quality)
    {
        Post(() =>
        {
            var next = string.IsNullOrWhiteSpace(quality) ? "Not measured" : quality;
            if (CallQuality == next)
            {
                return;
            }

            CallQuality = next;
            Changed?.Invoke();
        });
    }

    public void StageNumber(string number)
    {
        Post(() =>
        {
            StagedNumber = number;
            Changed?.Invoke();
        });
    }

    public void ConsumeStagedNumber() => StagedNumber = null;

    public void SetCallFlags(bool? muted = null, bool? speaker = null, bool? hold = null)
    {
        Post(() =>
        {
            Muted = muted ?? Muted;
            SpeakerOn = speaker ?? SpeakerOn;
            OnHold = hold ?? OnHold;
            Changed?.Invoke();
        });
    }

    public void Tick()
    {
        Post(() =>
        {
            if (Phase == PhonePhase.InCall)
            {
                CallSeconds++;
                Changed?.Invoke();
            }
        });
    }

    public void TouchLists()
    {
        Post(() =>
        {
            Revision++;
            Changed?.Invoke();
        });
    }

    private global::Android.OS.Handler Handler
    {
        get
        {
            lock (_gate)
            {
                return _handler ??= new global::Android.OS.Handler(global::Android.OS.Looper.MainLooper!);
            }
        }
    }
}
