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
    public double MosScore { get; init; }
    public string QualityLevel { get; init; } = "";
    public double PacketLossPercent { get; init; }
    public double JitterMs { get; init; }
    public double LatencyMs { get; init; }
    public double BitrateSendKbps { get; init; }
    public double BitrateRecvKbps { get; init; }
    public int SignalBars { get; init; }
    public string Codec { get; init; } = "";
    public double RFactor { get; init; }
    public bool QualityMeasured { get; init; }

    [System.Text.Json.Serialization.JsonIgnore]
    public bool HasMeasuredQuality => QualityMeasured && MosScore > 0;

    [System.Text.Json.Serialization.JsonIgnore]
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

    [System.Text.Json.Serialization.JsonIgnore]
    public string MosDisplay => HasMeasuredQuality ? $"{MosScore:F1} MOS" : "Not measured";

    [System.Text.Json.Serialization.JsonIgnore]
    public string QualitySummaryDisplay => HasMeasuredQuality
        ? QualityLevel switch
        {
            "Excellent" or "Good" or "Fair" or "Poor" => $"● {MosDisplay}",
            _ => MosDisplay
        }
        : "Not measured";

    [System.Text.Json.Serialization.JsonIgnore]
    public string QualityBadgeBackground => HasMeasuredQuality
        ? QualityLevel switch
        {
            "Excellent" => "#DEF7EC",
            "Good" => "#E0F2FE",
            "Fair" => "#FEF3C7",
            "Poor" => "#FEE2E2",
            _ => "#F3F4F6"
        }
        : "#F1F5F9";

    [System.Text.Json.Serialization.JsonIgnore]
    public string QualityBadgeForeground => HasMeasuredQuality
        ? QualityLevel switch
        {
            "Excellent" => "#03543F",
            "Good" => "#0369A1",
            "Fair" => "#92400E",
            "Poor" => "#B91C1C",
            _ => "#4B5563"
        }
        : "#64748B";

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
        "Missed" => "✕ Missed",
        _ => Direction
    };

    [System.Text.Json.Serialization.JsonIgnore]
    public string DirectionColor => Direction switch
    {
        "Inbound" => "#2563EB",
        "Outbound" => "#10B981",
        "Missed" => "#EF4444",
        _ => "#64748B"
    };

    public static bool IsStockFiller(CallHistoryEntry call)
    {
        var name = call.Name?.Trim() ?? "";
        var detail = call.Detail?.Trim() ?? "";
        return name.Equals("PBX Echo & Line Quality Test", StringComparison.OrdinalIgnoreCase)
            || name.Equals("Voicemail Audio Diagnostic", StringComparison.OrdinalIgnoreCase)
            || detail.Equals("Line quality test completed.", StringComparison.OrdinalIgnoreCase)
            || detail.Equals("Voicemail greeting played.", StringComparison.OrdinalIgnoreCase);
    }
}
