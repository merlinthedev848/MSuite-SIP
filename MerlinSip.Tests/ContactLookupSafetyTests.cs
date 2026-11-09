using System.Collections.Generic;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class ContactLookupSafetyTests
{
    private readonly ContactStore _store = new();

    [Fact]
    public void FindByNumber_StarTwo_DoesNotMatchExtensionEndingInTwo()
    {
        var contacts = new List<ContactEntry>
        {
            new() { Name = "Alex Hisley", Number = "807" },
            new() { Name = "Alex Hisley Mobile", Number = "822" },
            new() { Name = "Reception", Number = "1002" }
        };

        var matched = _store.FindByNumber(contacts, "*2");
        Assert.Null(matched);
    }

    [Fact]
    public void FindByNumber_ShortDigits_DoNotSuffixMatchLongerExtensions()
    {
        var contacts = new List<ContactEntry>
        {
            new() { Name = "Alex Hisley Mobile", Number = "822" },
            new() { Name = "Office Desk", Number = "1060" }
        };

        Assert.Null(_store.FindByNumber(contacts, "2"));
        Assert.Null(_store.FindByNumber(contacts, "22"));
        Assert.Null(_store.FindByNumber(contacts, "60"));
        Assert.NotNull(_store.FindByNumber(contacts, "822"));
        Assert.Equal("Alex Hisley Mobile", _store.FindByNumber(contacts, "822")!.Name);
    }

    [Fact]
    public void FindByNumber_FullPstnNumbers_SupportCountryCodeVariants()
    {
        var contacts = new List<ContactEntry>
        {
            new() { Name = "Client Support", Number = "+442036567447" }
        };

        // UK national 020 format should match +4420
        var matched = _store.FindByNumber(contacts, "02036567447");
        Assert.NotNull(matched);
        Assert.Equal("Client Support", matched!.Name);
    }

    [Fact]
    public void DeskPhone_GetFeatureCodeName_IdentifiesVoicemailAndPstnCodes()
    {
        Assert.Equal("Voicemail", DeskPhone.GetFeatureCodeName("*2"));
        Assert.Equal("Voicemail", DeskPhone.GetFeatureCodeName("*97"));
        Assert.Equal("Voicemail", DeskPhone.GetFeatureCodeName("*98"));
        Assert.Equal("Group Pickup", DeskPhone.GetFeatureCodeName("*4"));
        Assert.Equal("DND On", DeskPhone.GetFeatureCodeName("*74"));
        Assert.Equal("DND Off", DeskPhone.GetFeatureCodeName("*074"));
        Assert.Equal("Call Park", DeskPhone.GetFeatureCodeName("*6"));
        Assert.Equal("One-Touch Record", DeskPhone.GetFeatureCodeName("*1"));
        Assert.Equal("Intercom (503)", DeskPhone.GetFeatureCodeName("*5503"));
        Assert.Null(DeskPhone.GetFeatureCodeName("822"));
        Assert.Null(DeskPhone.GetFeatureCodeName("02036567447"));
    }
}
