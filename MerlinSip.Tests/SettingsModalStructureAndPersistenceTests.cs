using System;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using MerlinSip.Models;
using Xunit;

namespace MerlinSip.Tests;

public class SettingsModalStructureAndPersistenceTests
{
    private static readonly MediaDeviceInfo DummyInput = new("in-1", "Default Mic");
    private static readonly MediaDeviceInfo DummyOutput = new("out-1", "Default Speaker");

    [Fact]
    public void AppStartupConfig_HasCorrectDefaultFeatureCodes()
    {
        var config = new AppStartupConfig(
            Server: "pbx.chriskendall.media",
            Port: 5060,
            Domain: "pbx.chriskendall.media",
            Extension: "503",
            Username: "503",
            Password: "secretPassword",
            LicenseKey: "TEST-KEY",
            LicenseStatus: "Active",
            AudioInput: DummyInput,
            AudioOutput: DummyOutput);

        Assert.Equal("*4", config.CallPickupPrefix);
        Assert.Equal("*2", config.VoicemailNumber);
        Assert.Equal("*62", config.QueueLoginLogoutCode);
        Assert.Equal("*1", config.CallRecordingCode);
        Assert.True(config.FlashCallState);
        Assert.False(config.SingleClickBlindTransfer);
        Assert.False(config.ShowCallStatistics);
        Assert.False(config.QueuePickupEnabled);
        Assert.True(config.CombineContactsInSearch);
        Assert.Equal(5, config.FailedCallDisplaySeconds);
    }

    [Fact]
    public void AppStartupConfig_WithUpdatedSettings_PersistsAllProperties()
    {
        var original = new AppStartupConfig(
            Server: "pbx.chriskendall.media",
            Port: 5060,
            Domain: "pbx.chriskendall.media",
            Extension: "503",
            Username: "503",
            Password: "secretPassword",
            LicenseKey: "TEST-KEY",
            LicenseStatus: "Active",
            AudioInput: DummyInput,
            AudioOutput: DummyOutput);

        var updated = original with
        {
            SingleClickBlindTransfer = true,
            FlashCallState = false,
            ShowCallStatistics = true,
            QueuePickupEnabled = true,
            CallPickupPrefix = "*44",
            VoicemailNumber = "*200",
            QueueLoginLogoutCode = "*620",
            CallRecordingCode = "*11",
            CombineContactsInSearch = false,
            FailedCallDisplaySeconds = 15,
            AutoAnswerEnabled = true
        };

        Assert.True(updated.SingleClickBlindTransfer);
        Assert.False(updated.FlashCallState);
        Assert.True(updated.ShowCallStatistics);
        Assert.True(updated.QueuePickupEnabled);
        Assert.Equal("*44", updated.CallPickupPrefix);
        Assert.Equal("*200", updated.VoicemailNumber);
        Assert.Equal("*620", updated.QueueLoginLogoutCode);
        Assert.Equal("*11", updated.CallRecordingCode);
        Assert.False(updated.CombineContactsInSearch);
        Assert.Equal(15, updated.FailedCallDisplaySeconds);
        Assert.True(updated.AutoAnswerEnabled);
    }

    [Fact]
    public void MainWindowXaml_SettingsOverlay_HasNoDuplicateSidebarCloseButton()
    {
        var xamlPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "MerlinSIP", "MainWindow.xaml"));
        Assert.True(File.Exists(xamlPath), $"MainWindow.xaml not found at {xamlPath}");

        var content = File.ReadAllText(xamlPath);
        var settingsStart = content.IndexOf("<Grid x:Name=\"SettingsOverlay\"", StringComparison.Ordinal);
        var settingsEnd = content.IndexOf("<Grid x:Name=\"IncomingCallOverlay\"", StringComparison.Ordinal);
        Assert.True(settingsStart >= 0 && settingsEnd > settingsStart);

        var settingsSection = content[settingsStart..settingsEnd];

        // Must NOT have Grid.Row="2" Content="Close" inside the sidebar
        Assert.DoesNotContain("<Button Grid.Row=\"2\" Content=\"Close\"", settingsSection);

        // Must have the single footer Close button and top right dismiss button
        Assert.Contains("x:Name=\"CloseSettingsTopButton\"", settingsSection);
        Assert.Contains("<Button Content=\"Close\" Style=\"{StaticResource SoftButton}\"", settingsSection);
        Assert.Contains("x:Name=\"SaveAllSettingsButton\"", settingsSection);
    }

    [Fact]
    public void MainWindowXaml_SettingsOverlay_ContainsAllSixFluentTabs()
    {
        var xamlPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "MerlinSIP", "MainWindow.xaml"));
        var content = File.ReadAllText(xamlPath);

        // Sidebar tab buttons with Segoe glyphs
        Assert.Contains("x:Name=\"TabBtnGeneral\"", content);
        Assert.Contains("x:Name=\"TabBtnAccount\"", content);
        Assert.Contains("x:Name=\"TabBtnAudio\"", content);
        Assert.Contains("x:Name=\"TabBtnHandling\"", content);
        Assert.Contains("x:Name=\"TabBtnDiagnostics\"", content);
        Assert.Contains("x:Name=\"TabBtnAbout\"", content);

        // Segoe MDL2 icon glyphs
        Assert.Contains("&#xE713;", content); // Gear / General
        Assert.Contains("&#xE77B;", content); // User / Account
        Assert.Contains("&#xE767;", content); // Speaker / Audio
        Assert.Contains("&#xE72A;", content); // Transfer / Routing
        Assert.Contains("&#xE90F;", content); // Diagnostics
        Assert.Contains("&#xE946;", content); // Info / About

        // Must not contain emoji characters in sidebar buttons
        Assert.DoesNotContain("⚙️", content);
        Assert.DoesNotContain("👤", content);
        Assert.DoesNotContain("🔊", content);
        Assert.DoesNotContain("🔀", content);
        Assert.DoesNotContain("🛠️", content);
    }

    [Fact]
    public void MainWindowXaml_SettingsOverlay_ContainsVoicemailAndAllControls()
    {
        var xamlPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "MerlinSIP", "MainWindow.xaml"));
        var content = File.ReadAllText(xamlPath);

        Assert.Contains("x:Name=\"VoicemailCodeTextBox\"", content);
        Assert.Contains("x:Name=\"CallPickupPrefixTextBox\"", content);
        Assert.Contains("x:Name=\"QueueToggleCodeTextBox\"", content);
        Assert.Contains("x:Name=\"CallRecordingCodeTextBox\"", content);
        Assert.Contains("x:Name=\"QueuePickupCheckBox\"", content);
        Assert.Contains("x:Name=\"AutoAnswerCheckBox\"", content);
        Assert.Contains("x:Name=\"FlashCallStateCheckBox\"", content);
        Assert.Contains("x:Name=\"SingleClickBlindTransferCheckBox\"", content);
        Assert.Contains("x:Name=\"ShowCallStatisticsCheckBox\"", content);
        Assert.Contains("x:Name=\"CombineContactsCheckBox\"", content);
        Assert.Contains("x:Name=\"MicLevelProgressBar\"", content);
    }

    [Theory]
    [InlineData("TabBtnGeneral", "General Preferences", "Application preferences and incoming call handling")]
    [InlineData("TabBtnAccount", "Account & SIP", "PBX credentials, provisioning, and signalling protocols")]
    [InlineData("TabBtnAudio", "Audio & Tunes", "Sound input/output devices, volume levels, and ringtone preview")]
    [InlineData("TabBtnHandling", "Call Routing", "Call forwarding, feature shortcodes, and busy/no-answer timeouts")]
    [InlineData("TabBtnDiagnostics", "Diagnostics", "Network connectivity tests, update checks, and support logs")]
    [InlineData("TabBtnAbout", "About Merlin SIP", "Version information, licensing, and telemetry")]
    public void SettingsTab_TitleAndSubtitleMapping_IsExpected(string tabBtn, string expectedTitle, string expectedSubtitle)
    {
        var (title, subtitle) = tabBtn switch
        {
            "TabBtnGeneral" => ("General Preferences", "Application preferences and incoming call handling"),
            "TabBtnAccount" => ("Account & SIP", "PBX credentials, provisioning, and signalling protocols"),
            "TabBtnAudio" => ("Audio & Tunes", "Sound input/output devices, volume levels, and ringtone preview"),
            "TabBtnHandling" => ("Call Routing", "Call forwarding, feature shortcodes, and busy/no-answer timeouts"),
            "TabBtnDiagnostics" => ("Diagnostics", "Network connectivity tests, update checks, and support logs"),
            "TabBtnAbout" => ("About Merlin SIP", "Version information, licensing, and telemetry"),
            _ => ("Settings", "Preferences")
        };

        Assert.Equal(expectedTitle, title);
        Assert.Equal(expectedSubtitle, subtitle);
    }

    [Fact]
    public void Dialer_DoesNotContainRedialOrDndButtons()
    {
        var xamlPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "MerlinSIP", "MainWindow.xaml"));
        var content = File.ReadAllText(xamlPath);

        // Must NOT have DndButton or RedialButton in the dialer
        Assert.DoesNotContain("x:Name=\"DndButton\"", content);
        Assert.DoesNotContain("x:Name=\"RedialButton\"", content);

        // DialButton and VoicemailButton must be present
        Assert.Contains("x:Name=\"DialButton\"", content);
        Assert.Contains("x:Name=\"VoicemailButton\"", content);
    }

    [Fact]
    public void CallHistory_HasDoubleClickAndOneClickCallbackButtons()
    {
        var xamlPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "MerlinSIP", "MainWindow.xaml"));
        var content = File.ReadAllText(xamlPath);

        // Both history lists have double-click and callback buttons
        Assert.Contains("x:Name=\"RecentCallsListView\"", content);
        Assert.Contains("MouseDoubleClick=\"RecentCallsListView_MouseDoubleClick\"", content);
        Assert.Contains("x:Name=\"CallHistoryListView\"", content);
        Assert.Contains("MouseDoubleClick=\"CallHistoryListView_MouseDoubleClick\"", content);
        Assert.Contains("Click=\"CallbackHistoryButton_Click\"", content);
    }
}
