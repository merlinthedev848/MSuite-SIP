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
    public double MosScore { get; init; } = 4.3;
    public string QualityLevel { get; init; } = "Excellent";
    public double PacketLossPercent { get; init; } = 0.0;
    public double JitterMs { get; init; } = 1.8;
    public double LatencyMs { get; init; } = 22.0;
    public double BitrateSendKbps { get; init; } = 64.0;
    public double BitrateRecvKbps { get; init; } = 64.0;
    public int SignalBars { get; init; } = 5;
    public string Codec { get; init; } = "PCMU (G.711u)";
    public double RFactor { get; init; } = 92.5;

    [System.Text.Json.Serialization.JsonIgnore]
    public string MosDisplay => MosScore > 0 ? $"{MosScore:F1} MOS" : "N/A";

    [System.Text.Json.Serialization.JsonIgnore]
    public string QualitySummaryDisplay => QualityLevel switch
    {
        "Excellent" => $"● {MosDisplay}",
        "Good" => $"● {MosDisplay}",
        "Fair" => $"● {MosDisplay}",
        "Poor" => $"● {MosDisplay}",
        _ => $"○ {MosDisplay}"
    };

    [System.Text.Json.Serialization.JsonIgnore]
    public string QualityBadgeBackground => QualityLevel switch
    {
        "Excellent" => "#DEF7EC",
        "Good" => "#E0F2FE",
        "Fair" => "#FEF3C7",
        "Poor" => "#FEE2E2",
        _ => "#F3F4F6"
    };

    [System.Text.Json.Serialization.JsonIgnore]
    public string QualityBadgeForeground => QualityLevel switch
    {
        "Excellent" => "#03543F",
        "Good" => "#0369A1",
        "Fair" => "#92400E",
        "Poor" => "#B91C1C",
        _ => "#4B5563"
    };

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
