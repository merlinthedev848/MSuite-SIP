using System.Text.Json.Serialization;

namespace MerlinSip.Models;

public sealed record ContactEntry
{
    public string Name { get; init; } = "";
    public string Number { get; init; } = "";
    public string Company { get; init; } = "";
    public string Notes { get; init; } = "";
    public bool IsFavorite { get; init; } = false;

    [JsonIgnore]
    public string Initials
    {
        get
        {
            var text = string.IsNullOrWhiteSpace(Name) ? Number : Name;
            if (string.IsNullOrWhiteSpace(text)) return "??";
            var parts = text.Split([' ', '.', '-'], StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2 && parts[0].Length > 0 && parts[1].Length > 0)
                return $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[1][0])}";
            return text.Length >= 2 ? text[..2].ToUpperInvariant() : text.ToUpperInvariant();
        }
    }

    [JsonIgnore]
    public string Presence { get; init; } = "Offline";

    [JsonIgnore]
    public string PresenceLabel => Presence switch
    {
        "Available" => "Available",
        "Ringing" => "Ringing",
        "Busy" => "Busy",
        "DND" or "Do Not Disturb" => "DND",
        "Away" or "Appear Away" => "Away",
        "Offline" => "Offline",
        _ => "Offline"
    };

    [JsonIgnore]
    public string PresenceBrush => Presence switch
    {
        "Available" => "#10B981",
        "Away" or "Appear Away" => "#10B981",
        "DND" or "Do Not Disturb" => "#DC2626",
        "Busy" => "#EF4444",
        "Ringing" => "#EF4444",
        "Offline" => "#94A3B8",
        _ => "#94A3B8"
    };

    [JsonIgnore]
    public string PresenceBackground => Presence switch
    {
        "Available" => "#DFF8EE",
        "Away" or "Appear Away" => "#DFF8EE",
        "DND" or "Do Not Disturb" => "#FEE2E2",
        "Busy" => "#FEE2E2",
        "Ringing" => "#FEE2E2",
        "Offline" => "#F1F5F9",
        _ => "#F1F5F9"
    };

    [JsonIgnore]
    public string PresenceForeground => Presence switch
    {
        "Available" => "#106247",
        "Away" or "Appear Away" => "#106247",
        "DND" or "Do Not Disturb" => "#9B1C1C",
        "Busy" => "#9B1C1C",
        "Ringing" => "#9B1C1C",
        "Offline" => "#475569",
        _ => "#475569"
    };

    [JsonIgnore]
    public string PresenceBorderBrush => Presence switch
    {
        "Offline" => "#64748B",
        _ => "#111317"
    };

    [JsonIgnore]
    public bool IsPresenceVisible => !string.IsNullOrWhiteSpace(Presence);

    [JsonIgnore]
    public System.Windows.Visibility PresenceVisibility => IsPresenceVisible ? System.Windows.Visibility.Visible : System.Windows.Visibility.Collapsed;

    public const string DirectedPickupPrefix = "*04";

    [JsonIgnore]
    public string BlfDialNumber => Presence == "Ringing" ? DirectedPickupPrefix + Number : Number;

    [JsonIgnore]
    public string CallToolTip => Presence == "Ringing" ? "Pick up ringing call" : "Call contact";
}
