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
        "Offline" => "",
        _ => ""
    };

    [JsonIgnore]
    public string PresenceBrush => Presence switch
    {
        "Available" => "#10B981",
        "Away" or "Appear Away" => "#10B981",
        "DND" or "Do Not Disturb" => "#DC2626",
        "Busy" => "#EF4444",
        "Ringing" => "#F59E0B",
        "Offline" => "#00000000",
        _ => "#00000000"
    };

    [JsonIgnore]
    public string PresenceBackground => Presence switch
    {
        "Available" => "#DFF8EE",
        "Away" or "Appear Away" => "#DFF8EE",
        "DND" or "Do Not Disturb" => "#FEE2E2",
        "Busy" => "#FEE2E2",
        "Ringing" => "#FFF3D6",
        "Offline" => "#00000000",
        _ => "#00000000"
    };

    [JsonIgnore]
    public string PresenceForeground => Presence switch
    {
        "Available" => "#106247",
        "Away" or "Appear Away" => "#106247",
        "DND" or "Do Not Disturb" => "#9B1C1C",
        "Busy" => "#9B1C1C",
        "Ringing" => "#8A4F08",
        "Offline" => "#00000000",
        _ => "#00000000"
    };

    [JsonIgnore]
    public string PresenceBorderBrush => Presence switch
    {
        "Offline" => "#00000000",
        _ => "#111317"
    };

    [JsonIgnore]
    public bool IsPresenceVisible => !string.Equals(Presence, "Offline", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(Presence);

    [JsonIgnore]
    public System.Windows.Visibility PresenceVisibility => IsPresenceVisible ? System.Windows.Visibility.Visible : System.Windows.Visibility.Collapsed;
}
