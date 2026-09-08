using System;
using System.Threading;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class MwiServiceTests
{
    private class FakeMwiTransport : IMwiSipTransport
    {
        public AppStartupConfig? Config { get; set; } = new AppStartupConfig(
            "pbx.merlin.local", 5060, "pbx.merlin.local", "100", "user100", "pass", "LIC123", "Licensed",
            new MediaDeviceInfo("in", "Input"), new MediaDeviceInfo("out", "Output"));

        public string Domain => "pbx.merlin.local";
        public string LocalAddress => "192.168.1.50";
        public int LocalPort => 5060;
        public string SipTransportName => "UDP";
        public string ContactTransport => "udp";

        public string LastSentRequest { get; private set; } = "";

        public Task<SipResponse> SendRequestAndWaitAsync(string request, CancellationToken cancellationToken = default)
        {
            LastSentRequest = request;
            return Task.FromResult(new SipResponse(200, "OK", new System.Collections.Generic.Dictionary<string, string>(), ""));
        }

        public string BuildDigestAuthorization(string method, string uri, string challengeHeader) => "Digest username=\"user100\"";
        public string CreateBranch() => "z9hG4bK_testbranch";
    }

    [Fact]
    public void MwiService_HandleNotify_ParsesMessagesWaiting_Yes()
    {
        var transport = new FakeMwiTransport();
        using var mwi = new MwiService(transport);

        VoicemailStatus? status = null;
        mwi.VoicemailCountChanged += (s, e) => status = e;

        const string sipNotifyBody = 
            "Messages-Waiting: yes\r\n" +
            "Message-Account: sip:100@pbx.merlin.local\r\n" +
            "Voice-Message: 3/5 (1/2)\r\n";

        mwi.HandleNotify(sipNotifyBody);

        Assert.NotNull(status);
        Assert.True(status.HasMessages);
        Assert.Equal(3, status.NewMessages);
        Assert.Equal(5, status.OldMessages);
    }

    [Fact]
    public void MwiService_HandleNotify_ParsesMessagesWaiting_No()
    {
        var transport = new FakeMwiTransport();
        using var mwi = new MwiService(transport);

        VoicemailStatus? status = null;
        mwi.VoicemailCountChanged += (s, e) => status = e;

        const string sipNotifyBody = 
            "Messages-Waiting: no\r\n" +
            "Message-Account: sip:100@pbx.merlin.local\r\n" +
            "Voice-Message: 0/0\r\n";

        mwi.HandleNotify(sipNotifyBody);

        Assert.NotNull(status);
        Assert.False(status.HasMessages);
        Assert.Equal(0, status.NewMessages);
        Assert.Equal(0, status.OldMessages);
    }
}
