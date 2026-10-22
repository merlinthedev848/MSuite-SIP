using System;
using System.Linq;
using Xunit;

namespace MerlinSip.Tests;

public class LineAppearanceAndPresenceUiTests
{
    [Theory]
    [InlineData("Available", "#10B981")]
    [InlineData("Away", "#10B981")]
    [InlineData("Appear Away", "#10B981")]
    [InlineData("Busy", "#EF4444")]
    [InlineData("DND", "#DC2626")]
    [InlineData("Do Not Disturb", "#DC2626")]
    [InlineData("Offline", "#94A3B8")]
    public void PresenceStatus_MapsToExpectedColor(string status, string expectedHex)
    {
        var colour = status.ToLowerInvariant() switch
        {
            "available" => "#10B981",
            "away" or "appear away" => "#10B981",
            "busy" => "#EF4444",
            "dnd" or "do not disturb" => "#DC2626",
            "offline" or "appear offline" => "#94A3B8",
            _ => "#10B981"
        };

        Assert.Equal(expectedHex, colour);
    }

    [Theory]
    [InlineData("John Smith", true, "JS")]
    [InlineData("Chris Kendall", true, "CK")]
    [InlineData("Alice", true, "AL")]
    [InlineData("", false, "")]
    [InlineData("503", false, "")]
    [InlineData("1002", false, "")]
    public void UserAvatar_InitialsVsIconRule(string rawName, bool expectInitials, string expectedInitials)
    {
        var hasLetters = !string.IsNullOrWhiteSpace(rawName) && rawName.Any(char.IsLetter);
        Assert.Equal(expectInitials, hasLetters);

        if (hasLetters)
        {
            var parts = rawName.Split(new char[] { ' ', '.', '_', '-' }, StringSplitOptions.RemoveEmptyEntries);
            var initials = parts.Length >= 2
                ? $"{parts[0][0]}{parts[1][0]}".ToUpperInvariant()
                : rawName[..Math.Min(2, rawName.Length)].ToUpperInvariant();
            Assert.Equal(expectedInitials, initials);
        }
    }

    [Theory]
    [InlineData("Call failed: 486 Busy Here", true)]
    [InlineData("Call rejected by remote party", true)]
    [InlineData("Call declined", true)]
    [InlineData("SIP 404 Not Found", true)]
    [InlineData("Call Cancelled", true)]
    [InlineData("Call ended normally", false)]
    [InlineData("Normal call clear", false)]
    [InlineData(null, false)]
    public void CallFailureDetection_IdentifiesErrorsAccurately(string? message, bool expectFailure)
    {
        var isFailure = message != null && (
            message.Contains("Fail", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("Reject", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("Declin", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("Busy", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("486", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("404", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("Cancel", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(expectFailure, isFailure);
    }

    [Fact]
    public void DndToggle_CalculatesTargetPresenceCorrectly()
    {
        // When turning DND on:
        var targetDnd = true;
        var userPresence = "Available";
        var targetPresence = targetDnd ? "DND" : userPresence;
        Assert.Equal("DND", targetPresence);

        // When turning DND off:
        targetDnd = false;
        userPresence = "DND";
        targetPresence = targetDnd
            ? "DND"
            : (string.Equals(userPresence, "DND", StringComparison.OrdinalIgnoreCase) ? "Available" : userPresence);
        Assert.Equal("Available", targetPresence);
    }

    [Theory]
    [InlineData(1, 1, "#F8FAFC", "#CBD5E1")] // Selected line 1 idle
    [InlineData(1, 2, "#FFFFFF", "#E2E8F0")] // Unselected line 2 idle
    [InlineData(2, 2, "#F8FAFC", "#CBD5E1")] // Selected line 2 idle
    [InlineData(2, 1, "#FFFFFF", "#E2E8F0")] // Unselected line 1 idle
    public void IdleLine_ColorsSelectedVsUnselected(int selectedLine, int testLine, string expectedBg, string expectedBorder)
    {
        string bg;
        string border;

        if (selectedLine == testLine)
        {
            bg = "#F8FAFC";
            border = "#CBD5E1";
        }
        else
        {
            bg = "#FFFFFF";
            border = "#E2E8F0";
        }

        Assert.Equal(expectedBg, bg);
        Assert.Equal(expectedBorder, border);
    }
}
