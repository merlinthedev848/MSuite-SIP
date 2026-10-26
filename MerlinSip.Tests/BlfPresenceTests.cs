using System.Windows;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class BlfPresenceTests
{
    [Theory]
    [InlineData("Available", "Available", "#10B981", "#DFF8EE", "#106247", true, Visibility.Visible)]
    [InlineData("Away", "Away", "#10B981", "#DFF8EE", "#106247", true, Visibility.Visible)]
    [InlineData("Appear Away", "Away", "#10B981", "#DFF8EE", "#106247", true, Visibility.Visible)]
    [InlineData("DND", "DND", "#DC2626", "#FEE2E2", "#9B1C1C", true, Visibility.Visible)]
    [InlineData("Do Not Disturb", "DND", "#DC2626", "#FEE2E2", "#9B1C1C", true, Visibility.Visible)]
    [InlineData("Busy", "Busy", "#EF4444", "#FEE2E2", "#9B1C1C", true, Visibility.Visible)]
    [InlineData("Ringing", "Ringing", "#EF4444", "#FEE2E2", "#9B1C1C", true, Visibility.Visible)]
    [InlineData("Offline", "Offline", "#94A3B8", "#F1F5F9", "#475569", true, Visibility.Visible)]
    public void ContactEntry_PresenceProperties_MatchRequirements(
        string presence,
        string expectedLabel,
        string expectedBrush,
        string expectedBackground,
        string expectedForeground,
        bool expectedIsVisible,
        Visibility expectedVisibility)
    {
        var contact = new ContactEntry { Name = "Test User", Number = "102", Presence = presence };

        Assert.Equal(expectedLabel, contact.PresenceLabel);
        Assert.Equal(expectedBrush, contact.PresenceBrush);
        Assert.Equal(expectedBackground, contact.PresenceBackground);
        Assert.Equal(expectedForeground, contact.PresenceForeground);
        Assert.Equal(expectedIsVisible, contact.IsPresenceVisible);
        Assert.Equal(expectedVisibility, contact.PresenceVisibility);
    }

    [Theory]
    [InlineData("", "Offline", "presence", "Offline")]
    [InlineData("Available", "Offline", "presence", "Offline")]
    [InlineData("Available", "Available", "presence", "Available")]
    [InlineData("Offline", "DND", "presence", "DND")]
    [InlineData("Offline", "Available", "dialog", "Offline")]
    [InlineData("Available", "Busy", "dialog", "Busy")]
    [InlineData("Available", "Ringing", "dialog", "Ringing")]
    [InlineData("Available", "Available", "dialog", "Available")]
    public void BlfChannels_UsesServerConnectivityAndCallState(string reachability, string incoming, string eventName, string expected)
    {
        var updated = SipRegistrationService.BlfChannels.Apply(new SipRegistrationService.BlfChannels(Reachability: reachability), incoming, eventName);
        Assert.Equal(expected, updated.Resolve());
    }

    [Fact]
    public void BlfChannels_IdleDialogDoesNotHideAnOfflinePhone()
    {
        var afterPresence = SipRegistrationService.BlfChannels.Apply(default, "Offline", "presence");
        var afterDialog = SipRegistrationService.BlfChannels.Apply(afterPresence, "Available", "dialog");

        Assert.Equal("Offline", afterDialog.Resolve());
    }

    [Fact]
    public void BlfChannels_ConnectedIdlePhoneStaysAvailable()
    {
        var afterPresence = SipRegistrationService.BlfChannels.Apply(default, "Available", "presence");
        var afterDialog = SipRegistrationService.BlfChannels.Apply(afterPresence, "Available", "dialog");

        Assert.Equal("Available", afterDialog.Resolve());
    }

    [Fact]
    public void ContactEntry_RingingBlf_DialsYeastarDirectedPickup()
    {
        var ringing = new ContactEntry { Number = "705", Presence = "Ringing" };
        var idle = new ContactEntry { Number = "705", Presence = "Available" };

        Assert.Equal("*04705", ringing.BlfDialNumber);
        Assert.Equal("705", idle.BlfDialNumber);
    }

    [Fact]
    public void ParsePresenceState_DialogInfoIdle_ReturnsAvailable()
    {
        var xml = """
            <?xml version="1.0"?>
            <dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="1" state="full" entity="sip:102@pbx.chriskendall.media">
            </dialog-info>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("Available", state);
    }

    [Fact]
    public void ParsePresenceState_DialogInfoEarly_ReturnsRinging()
    {
        var xml = """
            <?xml version="1.0"?>
            <dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="2" state="full" entity="sip:102@pbx.chriskendall.media">
              <dialog id="dlg1" direction="recipient">
                <state>early</state>
              </dialog>
            </dialog-info>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("Ringing", state);
    }

    [Fact]
    public void ParsePresenceState_DialogInfoConfirmed_ReturnsBusy()
    {
        var xml = """
            <?xml version="1.0"?>
            <dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="3" state="full" entity="sip:102@pbx.chriskendall.media">
              <dialog id="dlg1">
                <state>confirmed</state>
              </dialog>
            </dialog-info>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("Busy", state);
    }

    [Fact]
    public void ParsePresenceState_DialogInfoTerminated_ReturnsAvailable()
    {
        var xml = """
            <?xml version="1.0"?>
            <dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="4" state="full" entity="sip:102@pbx.chriskendall.media">
              <dialog id="dlg1">
                <state>terminated</state>
              </dialog>
            </dialog-info>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("Available", state);
    }

    [Fact]
    public void ParsePresenceState_PidfDnd_ReturnsDnd()
    {
        var xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <presence xmlns="urn:ietf:params:xml:ns:pidf"
                      xmlns:dm="urn:ietf:params:xml:ns:pidf:data-model"
                      xmlns:rpid="urn:ietf:params:xml:ns:pidf:rpid"
                      entity="sip:102@pbx.chriskendall.media">
              <tuple id="102">
                <status><basic>open</basic></status>
                <note>DND</note>
              </tuple>
              <dm:person id="p1">
                <rpid:activities>
                  <rpid:do-not-disturb/>
                </rpid:activities>
                <dm:note>DND</dm:note>
              </dm:person>
            </presence>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("DND", state);
    }

    [Fact]
    public void ParsePresenceState_PidfAway_ReturnsAway()
    {
        var xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <presence xmlns="urn:ietf:params:xml:ns:pidf"
                      xmlns:dm="urn:ietf:params:xml:ns:pidf:data-model"
                      xmlns:rpid="urn:ietf:params:xml:ns:pidf:rpid"
                      entity="sip:102@pbx.chriskendall.media">
              <tuple id="102">
                <status><basic>open</basic></status>
                <note>Away</note>
              </tuple>
              <dm:person id="p1">
                <rpid:activities>
                  <rpid:away/>
                </rpid:activities>
              </dm:person>
            </presence>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("Away", state);
    }

    [Fact]
    public void ParsePresenceState_PidfClosed_ReturnsOffline()
    {
        var xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <presence xmlns="urn:ietf:params:xml:ns:pidf" entity="sip:102@pbx.chriskendall.media">
              <tuple id="102">
                <status><basic>closed</basic></status>
                <note>Offline</note>
              </tuple>
            </presence>
            """;

        var state = SipRegistrationService.ParsePresenceState(xml);
        Assert.Equal("Offline", state);
    }

    [Theory]
    [InlineData("<dialog-info entity=\"sip:102@pbx.com\"></dialog-info>", "102")]
    [InlineData("<dialog-info entity='103@pbx.com'></dialog-info>", "103")]
    [InlineData("<presence><tuple id=\"104\"><status><basic>open</basic></status></tuple></presence>", "104")]
    [InlineData("<dialog-info><local><identity>sip:105@pbx.com</identity></local></dialog-info>", "105")]
    public void ExtractPresenceExtension_ResolvesCorrectExtension(string body, string expectedExtension)
    {
        var ext = SipRegistrationService.ExtractPresenceExtension(body);
        Assert.Equal(expectedExtension, ext);
    }
}
