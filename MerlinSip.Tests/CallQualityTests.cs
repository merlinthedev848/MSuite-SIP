using System;
using System.Collections.Generic;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class CallQualityAndRingtoneTests
{
    [Fact]
    public void CallHistoryEntry_QualityProperties_FormatCorrectly()
    {
        var entry = new CallHistoryEntry
        {
            Name = "Alice Smith",
            Number = "102",
            Duration = "02:45",
            Result = "Connected",
            MosScore = 4.4,
            QualityLevel = "Excellent",
            PacketLossPercent = 0.0,
            JitterMs = 1.8,
            LatencyMs = 22.0,
            RFactor = 92.5
        };

        Assert.Equal("4.4 MOS", entry.MosDisplay);
        Assert.Equal("🟢 4.4 MOS", entry.QualitySummaryDisplay);
        Assert.Equal("#DEF7EC", entry.QualityBadgeBackground);
        Assert.Equal("#03543F", entry.QualityBadgeForeground);
        Assert.Equal(92.5, entry.RFactor);
    }

    [Fact]
    public void RingtonePlayer_Choices_ContainExpectedTones()
    {
        var choices = RingtonePlayer.Choices;
        Assert.Contains(choices, c => c.Id == "orbital-anthem");
        Assert.Contains(choices, c => c.Id == "teams-anthem");
        Assert.Contains(choices, c => c.Id == "skype-spark");
        Assert.Contains(choices, c => c.Id == "ring-classic");
    }
}
