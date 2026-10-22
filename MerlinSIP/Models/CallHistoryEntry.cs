namespace MerlinSip.Models;

public sealed record CallHistoryEntry
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Direction { get; init; } = "";
    public string Name { get; init; } = "";
    public string Number { get; init; } = "";
    public string StartedAt { get; init; } = DateTimeOffset.Now.ToString("s");
    public string EndedAt { get; init; } = "";
    public string Duration { get; init; } = "";
    public string Result { get; init; } = "";
    public string Detail { get; init; } = "";

    [System.Text.Json.Serialization.JsonIgnore]
    public string ResultBadgeBackground => Result switch
    {
        "Connected" or "Answered" => "#DEF7EC",
        "Declined" => "#FDE8E8",
        "Busy" => "#FEF3C7",
        "Cancelled" => "#F3F4F6",
        "Failed" => "#FEE2E2",
        "No Answer" => "#FEF3C7",
        _ => "#EEF4FB"
    };

    [System.Text.Json.Serialization.JsonIgnore]
    public string ResultBadgeForeground => Result switch
    {
        "Connected" or "Answered" => "#03543F",
        "Declined" => "#9B1C1C",
        "Busy" => "#92400E",
        "Cancelled" => "#4B5563",
        "Failed" => "#B91C1C",
        "No Answer" => "#B45309",
        _ => "#2750A7"
    };

    [System.Text.Json.Serialization.JsonIgnore]
    public string DirectionIcon => Direction switch
    {
        "Inbound" => "↙ Inbound",
        "Outbound" => "↗ Outbound",
        "Missed" => "↙ Missed",
        _ => Direction
    };
}
