using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class CallManagerTests
{
    private class FakeCallManagerSipProvider : ICallManagerSipProvider
    {
        public bool LastHeldState { get; private set; }
        public bool AnswerCalled { get; private set; }
        public string LastResumedCallId { get; private set; } = "";

        public Task<SipCallResult> SetHeldAsync(bool held, CancellationToken cancellationToken = default)
        {
            LastHeldState = held;
            return Task.FromResult(new SipCallResult(true, held ? "Held" : "Resumed"));
        }

        public Task<SipCallResult> AnswerCallAsync(PendingIncomingCall incoming, CancellationToken cancellationToken = default)
        {
            AnswerCalled = true;
            return Task.FromResult(new SipCallResult(true, "Answered"));
        }

        public Task<SipCallResult> ResumeSpecificCallAsync(string callId, CancellationToken cancellationToken = default)
        {
            LastResumedCallId = callId;
            return Task.FromResult(new SipCallResult(true, "Resumed"));
        }
    }

    [Fact]
    public async Task HoldCurrentAndAnswerAsync_PutsExistingOnHold_AndAddsNewCall()
    {
        var provider = new FakeCallManagerSipProvider();
        var manager = new CallManager(provider);

        // First initial call
        var initialCall = new PendingIncomingCall(
            "call-1", "INVITE...", new IPEndPoint(IPAddress.Loopback, 5060), "tag1", "rem1", "100", 1);
        await manager.HoldCurrentAndAnswerAsync(initialCall);

        Assert.Single(manager.ActiveCalls);
        Assert.False(manager.ActiveCalls[0].IsOnHold);
        Assert.Equal("call-1", manager.ActiveCalls[0].CallId);

        // Second incoming call triggers hold on first call
        var secondCall = new PendingIncomingCall(
            "call-2", "INVITE...", new IPEndPoint(IPAddress.Loopback, 5060), "tag2", "rem2", "101", 1);
        await manager.HoldCurrentAndAnswerAsync(secondCall);

        Assert.Equal(2, manager.ActiveCalls.Count);
        Assert.True(manager.ActiveCalls[0].IsOnHold);
        Assert.False(manager.ActiveCalls[1].IsOnHold);
        Assert.Equal("call-2", manager.ActiveCalls[1].CallId);
    }

    [Fact]
    public async Task SwitchToHeldCallAsync_SwapsCallStates()
    {
        var provider = new FakeCallManagerSipProvider();
        var manager = new CallManager(provider);

        var call1 = new PendingIncomingCall("call-1", "INVITE...", new IPEndPoint(IPAddress.Loopback, 5060), "tag1", "rem1", "100", 1);
        var call2 = new PendingIncomingCall("call-2", "INVITE...", new IPEndPoint(IPAddress.Loopback, 5060), "tag2", "rem2", "101", 1);

        await manager.HoldCurrentAndAnswerAsync(call1);
        await manager.HoldCurrentAndAnswerAsync(call2);

        // Now call-1 is on hold, call-2 is active. Switch back to call-1.
        await manager.SwitchToHeldCallAsync("call-1");

        Assert.False(manager.ActiveCalls[0].IsOnHold);
        Assert.True(manager.ActiveCalls[1].IsOnHold);
        Assert.Equal("call-1", provider.LastResumedCallId);
    }

    [Fact]
    public void RemoveCall_And_ClearCalls_RemovesFromCollection()
    {
        var provider = new FakeCallManagerSipProvider();
        var manager = new CallManager(provider);

        manager.ActiveCalls.Add(new CallState { CallId = "call-x", Target = "100", IsOnHold = false, StartTime = DateTime.UtcNow });
        Assert.Single(manager.ActiveCalls);

        manager.RemoveCall("call-x");
        Assert.Empty(manager.ActiveCalls);

        manager.ActiveCalls.Add(new CallState { CallId = "call-y", Target = "101", IsOnHold = false, StartTime = DateTime.UtcNow });
        manager.ClearCalls();
        Assert.Empty(manager.ActiveCalls);
    }
}
