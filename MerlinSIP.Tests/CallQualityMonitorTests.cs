using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip.Tests;

[TestClass]
public sealed class CallQualityMonitorTests
{
    [TestMethod]
    public async Task Start_EmitsFiniteClampedMetrics()
    {
        var source = new FakeQualitySource
        {
            Active = true,
            PacketLoss = double.NaN,
            Jitter = double.PositiveInfinity,
            Latency = -100
        };

        using var monitor = new CallQualityMonitor(source);
        var tcs = new TaskCompletionSource<CallQualityMetrics>(TaskCreationOptions.RunContinuationsAsynchronously);
        monitor.CallQualityChanged += (_, metrics) => tcs.TrySetResult(metrics);

        monitor.Start();
        var completed = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(3)));

        Assert.AreSame(tcs.Task, completed);
        var result = await tcs.Task;
        Assert.IsTrue(double.IsFinite(result.MosScore));
        Assert.IsTrue(double.IsFinite(result.PacketLoss));
        Assert.IsTrue(double.IsFinite(result.Jitter));
        Assert.IsTrue(double.IsFinite(result.Latency));
        Assert.AreEqual(100, result.PacketLoss);
        Assert.AreEqual(10_000, result.Jitter);
        Assert.AreEqual(0, result.Latency);
    }

    private sealed class FakeQualitySource : ICallQualityDataSource
    {
        public bool Active { get; set; }
        public double PacketLoss { get; set; }
        public double Jitter { get; set; }
        public double Latency { get; set; }
        public bool IsCallActive => Active;
        public double GetPacketLossPercentage() => PacketLoss;
        public double GetJitterMs() => Jitter;
        public double GetLatencyMs() => Latency;
    }
}
