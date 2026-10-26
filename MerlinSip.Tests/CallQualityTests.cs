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
        Assert.Equal("● 4.4 MOS", entry.QualitySummaryDisplay);
        Assert.Equal("#DEF7EC", entry.QualityBadgeBackground);
        Assert.Equal("#03543F", entry.QualityBadgeForeground);
        Assert.Equal(92.5, entry.RFactor);
    }

    [Fact]
    public void RingtonePlayer_Choices_ContainExpectedTones()
    {
        var choices = RingtonePlayer.Choices;
        Assert.Equal(4, choices.Count);
        Assert.Contains(choices, c => c.Id == "ring-classic" && c.Name.Contains("Ring 1"));
        Assert.Contains(choices, c => c.Id == "skype-spark" && c.Name.Contains("Ring 2"));
        Assert.Contains(choices, c => c.Id == "teams-anthem" && c.Name.Contains("Modern Ring"));
        Assert.Contains(choices, c => c.Id == "orbital-anthem" && c.Name.Contains("Orbital Techno"));
    }

    [Fact]
    public void CallQualityDetailsWindow_InitializesWithoutResourceException()
    {
        var thread = new System.Threading.Thread(() =>
        {
            var entry = new CallHistoryEntry
            {
                Name = "Test Call",
                Number = "500",
                Duration = "01:00",
                Result = "Connected",
                MosScore = 4.4,
                QualityLevel = "Excellent",
                PacketLossPercent = 0.0,
                JitterMs = 1.8,
                LatencyMs = 22.0
            };
            var window = new MerlinSip.CallQualityDetailsWindow(entry);
            Assert.NotNull(window);
        });
        thread.SetApartmentState(System.Threading.ApartmentState.STA);
        thread.Start();
        thread.Join();
    }

    [Fact]
    public void SipRegistrationService_BuildDialogInfoXml_OffHook_GeneratesCorrectXml()
    {
        var xml = SipRegistrationService.BuildDialogInfoXml("101", "pbx.example.com", true, "Phone is off the hook and cannot be contacted");
        
        Assert.Contains("xmlns=\"urn:ietf:params:xml:ns:dialog-info\"", xml);
        Assert.Contains("entity=\"sip:101@pbx.example.com\"", xml);
        Assert.Contains("<state>confirmed</state>", xml);
        Assert.Contains("<notes>Phone is off the hook and cannot be contacted</notes>", xml);
    }

    [Fact]
    public void SipRegistrationService_BuildDialogInfoXml_OnHook_GeneratesTerminatedXml()
    {
        var xml = SipRegistrationService.BuildDialogInfoXml("101", "pbx.example.com", false, "Phone is on the hook and available");
        
        Assert.Contains("<state>terminated</state>", xml);
        Assert.Contains("<notes>Phone is on the hook and available</notes>", xml);
    }

    [Fact]
    public void MainWindow_InitializesWithoutXamlParseException()
    {
        Exception? caughtEx = null;
        var thread = new System.Threading.Thread(() =>
        {
            try
            {
                if (System.Windows.Application.Current == null)
                {
                    var app = new MerlinSip.App
                    {
                        ShutdownMode = System.Windows.ShutdownMode.OnExplicitShutdown
                    };
                    app.InitializeComponent();
                }

                var config = new MerlinSip.Models.AppStartupConfig(
                    "pbx.example.com", 5060, "pbx.example.com", "101", "user101", "pass",
                    "LIC", "Licensed",
                    new MerlinSip.Models.MediaDeviceInfo("in", "In"),
                    new MerlinSip.Models.MediaDeviceInfo("out", "Out"));
                var window = new MerlinSip.MainWindow(config);
                if (window == null)
                {
                    caughtEx = new InvalidOperationException("MainWindow was not created.");
                }
            }
            catch (Exception ex)
            {
                caughtEx = ex;
            }
        });
        thread.SetApartmentState(System.Threading.ApartmentState.STA);
        thread.Start();
        thread.Join();
        Assert.True(caughtEx == null, caughtEx?.ToString());
    }
}
