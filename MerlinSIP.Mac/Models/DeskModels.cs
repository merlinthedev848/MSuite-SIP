using System.Text.Json.Serialization;

namespace MerlinSip.Mac;

public static class AppVersion
{
    public const string Current = "1.3.9.1";
    public const string ProductId = "merlin-sip";
    public const string FixedServer = "pbx.chriskendall.media";
    public const int FixedPort = 5060;
}

public sealed class DeskConfig
{
    public string LicenseKey { get; set; } = "";
    public string LicenseStatus { get; set; } = "";
    public string LicenseLocalKey { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Server { get; set; } = AppVersion.FixedServer;
    public int Port { get; set; } = AppVersion.FixedPort;
    public string Domain { get; set; } = AppVersion.FixedServer;
    public string Extension { get; set; } = "";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string Transport { get; set; } = "UDP";
    public int RegistrationExpiry { get; set; } = 3600;
    public int HeartbeatSeconds { get; set; } = 30;
    public int LocalSipPort { get; set; } = 0;
    public string AudioInputId { get; set; } = "default";
    public string AudioInputName { get; set; } = "System default";
    public string AudioOutputId { get; set; } = "default";
    public string AudioOutputName { get; set; } = "System default";
    public string CameraName { get; set; } = "Default camera";
    public double MicrophoneVolume { get; set; } = 1;
    public double SpeakerVolume { get; set; } = 1;
    public string Ringtone { get; set; } = "Classic";
    public bool AutoAnswer { get; set; }
    public bool DoNotDisturb { get; set; }
    public string Presence { get; set; } = "Available";
    public bool CallWaiting { get; set; } = true;
    public string DeclineAction { get; set; } = "Send busy";
    public string VoicemailNumber { get; set; } = "*2";
    public string PickupCode { get; set; } = "*4";
    public string QueueCode { get; set; } = "*62";
    public string RecordingCode { get; set; } = "*1";
    public bool ShowCallStatistics { get; set; }
    public bool SingleClickBlindTransfer { get; set; }
    public string PreferredCodecs { get; set; } = "PCMU,PCMA";
    public string StunServer { get; set; } = "stun.l.google.com:19302";
    public bool SetupComplete { get; set; }
    public bool IsProvisioned { get; set; }

    public bool AllowsCustomServer =>
        LicenseKey.StartsWith("PR", StringComparison.OrdinalIgnoreCase) ||
        LicenseKey.StartsWith("BUYOUT", StringComparison.OrdinalIgnoreCase) ||
        LicenseStatus.Contains("Buyout", StringComparison.OrdinalIgnoreCase);

    public string ResolvedDomain => string.IsNullOrWhiteSpace(Domain) ? Server.Trim() : Domain.Trim();
    public string AuthUsername => string.IsNullOrWhiteSpace(Username) ? Extension.Trim() : Username.Trim();

    public bool UsesTls => string.Equals(Transport, "TLS", StringComparison.OrdinalIgnoreCase);
    public bool UsesTcp => string.Equals(Transport, "TCP", StringComparison.OrdinalIgnoreCase);

    public void ApplyFixedEndpoint()
    {
        if (AllowsCustomServer && !string.IsNullOrWhiteSpace(Server))
        {
            if (string.IsNullOrWhiteSpace(Domain))
            {
                Domain = Server.Trim();
            }

            if (Port <= 0)
            {
                Port = UsesTls ? 5061 : AppVersion.FixedPort;
            }

            return;
        }

        Server = AppVersion.FixedServer;
        Domain = AppVersion.FixedServer;
        Port = UsesTls ? 5061 : AppVersion.FixedPort;
    }
}

public sealed class DeskContact
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Number { get; set; } = "";
    public string Company { get; set; } = "";
    public string Notes { get; set; } = "";
    public bool IsFavorite { get; set; }

    [JsonIgnore]
    public string Presence { get; set; } = "Offline";

    [JsonIgnore]
    public string PresenceLabel => Presence switch
    {
        "Available" => "Available",
        "Ringing" => "Ringing",
        "Busy" => "Busy",
        "DND" or "Do Not Disturb" => "DND",
        "Away" or "Appear Away" => "Away",
        _ => "Offline"
    };

    [JsonIgnore]
    public string LampColor => Presence switch
    {
        "Available" or "Away" or "Appear Away" => "#10B981",
        "DND" or "Do Not Disturb" => "#DC2626",
        "Busy" or "Ringing" => "#EF4444",
        _ => "#94A3B8"
    };

    [JsonIgnore]
    public bool LampFlashes => Presence == "Ringing";

    [JsonIgnore]
    public string BlfDialNumber => Presence == "Ringing" ? DeskPhone.DirectedPickupFor(Number) : Number;
}

public sealed class DeskCall
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Direction { get; set; } = "Out";
    public string Name { get; set; } = "";
    public string Number { get; set; } = "";
    public string StartedAt { get; set; } = DateTimeOffset.Now.ToString("s");
    public string Result { get; set; } = "";
    public int Seconds { get; set; }
    public string Codec { get; set; } = "";
    public double MosScore { get; set; }
    public double PacketLossPercent { get; set; }
    public double JitterMs { get; set; }
}

public sealed class DeskMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Direction { get; set; } = "Out";
    public string Name { get; set; } = "";
    public string Number { get; set; } = "";
    public string Message { get; set; } = "";
    public string SentAt { get; set; } = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss");
    public string Result { get; set; } = "Sent";
}

public sealed class LineSnapshot
{
    public int Id { get; init; }
    public string Phase { get; init; } = "Idle";
    public string Remote { get; init; } = "";
    public string RemoteName { get; init; } = "";
    public int Seconds { get; init; }
    public bool Muted { get; init; }
    public bool Held { get; init; }
    public bool Recording { get; init; }
    public bool Video { get; init; }
    public string Codec { get; init; } = "";
    public long PacketsSent { get; init; }
    public long PacketsReceived { get; init; }
    public long PacketsLost { get; init; }
    public double JitterMs { get; init; }
    public double LossPercent { get; init; }
    public double LatencyMs { get; init; }
    public double Mos { get; init; }
    public int SignalBars { get; init; }
    public bool QualityMeasured { get; init; }
    public string QualityText { get; init; } = "Not measured";
    public string RecordingPath { get; init; } = "";

    public bool IsLive => Phase is "Outgoing" or "Incoming" or "InCall";

    public string Clock
    {
        get
        {
            var time = TimeSpan.FromSeconds(Math.Max(0, Seconds));
            return time.TotalHours >= 1 ? time.ToString(@"h\:mm\:ss") : time.ToString(@"mm\:ss");
        }
    }

    public string Title
    {
        get
        {
            var who = string.IsNullOrWhiteSpace(RemoteName) ? Remote : RemoteName;
            if (string.IsNullOrWhiteSpace(who))
            {
                who = Phase == "Idle" ? "Ready" : Phase;
            }

            var held = Held ? " · Hold" : "";
            return $"Line {Id}  ·  {who}{held}";
        }
    }
}

public sealed class RowItem
{
    public string Key { get; init; } = "";
    public string Title { get; init; } = "";
    public string Subtitle { get; init; } = "";
    public string Trailing { get; init; } = "";
    public string Kind { get; init; } = "";
    public string Lamp { get; init; } = "#94A3B8";
    public bool Flash { get; init; }
    public bool ShowLamp { get; init; }
}

public sealed record AudioDevice(string Id, string Name);
