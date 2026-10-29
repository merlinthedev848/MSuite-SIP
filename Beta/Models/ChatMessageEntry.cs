using System;
using System.Text.Json.Serialization;

namespace MerlinSip.Models;

public sealed record ChatMessageEntry
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Direction { get; init; } = "";
    public string Name { get; init; } = "";
    public string Number { get; init; } = "";
    public string Message { get; init; } = "";
    public string SentAt { get; init; } = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss");
    public string Result { get; init; } = "";

    [JsonIgnore]
    public bool IsOutbound => string.Equals(Direction, "Outbound", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public string BubbleAlignment => IsOutbound ? "Right" : "Left";

    [JsonIgnore]
    public string BubbleBackground => IsOutbound ? "#EFF6FF" : "#FFFFFF";

    [JsonIgnore]
    public string BubbleBorderBrush => IsOutbound ? "#BFDBFE" : "#E2E8F0";

    [JsonIgnore]
    public string SenderForeground => IsOutbound ? "#1E40AF" : "#0F172A";

    [JsonIgnore]
    public string ResultBadgeBackground => IsOutbound ? "#DBEAFE" : "#F1F5F9";

    [JsonIgnore]
    public string ResultBadgeForeground => IsOutbound ? "#1D4ED8" : "#475569";

    [JsonIgnore]
    public string FormattedTime
    {
        get
        {
            if (DateTimeOffset.TryParse(SentAt, out var dt))
            {
                var local = dt.ToLocalTime();
                return local.Date == DateTime.Today
                    ? local.ToString("HH:mm")
                    : local.ToString("dd MMM HH:mm");
            }
            return SentAt;
        }
    }
}
