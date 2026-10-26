using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Media;
using Android.OS;

namespace MerlinSip.Mobile;

[Service(Exported = false, ForegroundServiceType = ForegroundService.TypeSpecialUse | ForegroundService.TypeMicrophone)]
public class SipForegroundService : Service
{
    public const int OngoingId = 4101;
    public const int IncomingId = 4102;
    private const string OngoingChannel = "merlin_sip";
    private const string CallChannel = "merlin_calls";

    private static SipForegroundService? _current;

    public static void Publish(string text, bool inCall, bool incoming = false)
    {
        var service = _current;
        if (service == null)
        {
            return;
        }

        service.ShowOngoing(text, inCall);
        if (incoming)
        {
            service.ShowIncoming(text);
        }
    }

    public static void ClearIncoming()
    {
        var manager = _current?.GetSystemService(NotificationService) as NotificationManager;
        manager?.Cancel(IncomingId);
    }

    public override IBinder? OnBind(Intent? intent) => null;

    public override StartCommandResult OnStartCommand(Intent? intent, StartCommandFlags flags, int startId)
    {
        _current = this;
        EnsureChannels();
        ShowOngoing(intent?.GetStringExtra("text") ?? "Merlin SIP", intent?.GetBooleanExtra("inCall", false) ?? false);
        PhoneRuntime.EnsureStarted(this);
        return StartCommandResult.Sticky;
    }

    public override void OnDestroy()
    {
        if (ReferenceEquals(_current, this))
        {
            _current = null;
        }

        base.OnDestroy();
    }

    private void ShowOngoing(string text, bool inCall)
    {
        var notification = Build(OngoingChannel, "Merlin SIP", text, false);
        if (OperatingSystem.IsAndroidVersionAtLeast(34))
        {
            var type = ForegroundService.TypeSpecialUse;
            if (inCall && CheckSelfPermission(Android.Manifest.Permission.RecordAudio) == Permission.Granted)
            {
                type |= ForegroundService.TypeMicrophone;
            }

            StartForeground(OngoingId, notification, type);
        }
        else if (OperatingSystem.IsAndroidVersionAtLeast(30) && inCall)
        {
            StartForeground(OngoingId, notification, ForegroundService.TypeMicrophone);
        }
        else
        {
            StartForeground(OngoingId, notification);
        }
    }

    private void ShowIncoming(string text)
    {
        var manager = (NotificationManager?)GetSystemService(NotificationService);
        manager?.Notify(IncomingId, Build(CallChannel, "Incoming call", text, true));
    }

    private Notification Build(string channel, string title, string text, bool alert)
    {
        var open = PendingIntent.GetActivity(
            this,
            0,
            new Intent(this, typeof(MainActivity)).SetFlags(ActivityFlags.SingleTop | ActivityFlags.ReorderToFront),
            PendingIntentFlags.Immutable | PendingIntentFlags.UpdateCurrent);
        var builder = new Notification.Builder(this, channel)
            .SetContentTitle(title)!
            .SetContentText(text)!
            .SetSmallIcon(Resource.Drawable.ic_stat_merlin)!
            .SetContentIntent(open)!
            .SetOngoing(!alert)!
            .SetAutoCancel(alert)!
            .SetOnlyAlertOnce(true)!;
        if (alert)
        {
            builder.SetCategory(Notification.CategoryCall);
        }

        return builder.Build();
    }

    private void EnsureChannels()
    {
        var manager = (NotificationManager?)GetSystemService(NotificationService);
        if (manager == null)
        {
            return;
        }

        var ongoing = new NotificationChannel(OngoingChannel, "Merlin SIP", NotificationImportance.Low)
        {
            Description = "Shows while the phone is registered."
        };
        var calls = new NotificationChannel(CallChannel, "Incoming calls", NotificationImportance.High)
        {
            Description = "Alerts for incoming SIP calls."
        };
        var sound = RingtoneManager.GetDefaultUri(RingtoneType.Ringtone);
        var attributes = new AudioAttributes.Builder()
            .SetUsage(AudioUsageKind.NotificationRingtone)!
            .SetContentType(AudioContentType.Sonification)!
            .Build();
        calls.SetSound(sound, attributes);
        calls.EnableVibration(true);
        manager.CreateNotificationChannel(ongoing);
        manager.CreateNotificationChannel(calls);
    }
}
