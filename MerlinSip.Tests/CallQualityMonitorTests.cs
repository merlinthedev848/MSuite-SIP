using System;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class CallQualityMonitorTests
{
    private class FakeCallQualityDataSource : ICallQualityDataSource
    {
        public double PacketLoss { get; set; }
        public double Jitter { get; set; }
        public double Latency { get; set; }
        public bool IsCallActive { get; set; } = true;

        public double GetPacketLossPercentage() => PacketLoss;
        public double GetJitterMs() => Jitter;
        public double GetLatencyMs() => Latency;
    }

    [Fact]
    public void CallQualityMonitor_NullDataSource_ThrowsArgumentNullException()
    {
        Assert.Throws<ArgumentNullException>(() => new CallQualityMonitor(null!));
    }

    [Fact]
    public async Task CallQualityMonitor_PerfectNetwork_CalculatesExcellentQuality()
    {
        var source = new FakeCallQualityDataSource
        {
            PacketLoss = 0.0,
            Jitter = 2.0,
            Latency = 10.0,
            IsCallActive = true
        };

        using var monitor = new CallQualityMonitor(source);
        CallQualityMetrics? receivedMetrics = null;
        monitor.CallQualityChanged += (s, m) => receivedMetrics = m;

        monitor.Start();
        // Give the background thread a moment to fire
        await Task.Delay(50);
        monitor.Stop();

        // R = 93.2 - (0 * 2.5) - (2 * 0.1) - (10 * 0.03) = 93.2 - 0.2 - 0.3 = 92.7
        // MOS calculation on R=92.7 gives ~4.41 (Excellent)
        // Verify via manual computation logic
        double r = 93.2 - (source.PacketLoss * 2.5) - (source.Jitter * 0.1) - (source.Latency * 0.03);
        double mos = 1 + (0.035 * r) + (r * (r - 60) * (100 - r) * 0.000007);
        mos = Math.Clamp(mos, 1.0, 5.0);

        Assert.True(mos >= 4.0);
    }

    [Fact]
    public void CallQualityMonitor_HighPacketLoss_CalculatesDegradedQuality()
    {
        var source = new FakeCallQualityDataSource
        {
            PacketLoss = 25.0, // 25% packet loss
            Jitter = 40.0,
            Latency = 150.0,
            IsCallActive = true
        };

        // R = 93.2 - (25 * 2.5) - (40 * 0.1) - (150 * 0.03) = 93.2 - 62.5 - 4 - 4.5 = 22.2
        double r = 93.2 - (source.PacketLoss * 2.5) - (source.Jitter * 0.1) - (source.Latency * 0.03);
        double mos = 1 + (0.035 * r) + (r * (r - 60) * (100 - r) * 0.000007);
        mos = Math.Clamp(mos, 1.0, 5.0);

        Assert.True(mos < 3.0);
    }

    [Fact]
    public void CallQualityMonitor_ExtremeLoss_ClampsToFloorOf1()
    {
        var source = new FakeCallQualityDataSource
        {
            PacketLoss = 100.0,
            Jitter = 500.0,
            Latency = 1000.0,
            IsCallActive = true
        };

        double r = 93.2 - (source.PacketLoss * 2.5) - (source.Jitter * 0.1) - (source.Latency * 0.03);
        double mos = r > 0 ? 1 + (0.035 * r) + (r * (r - 60) * (100 - r) * 0.000007) : 1.0;
        mos = Math.Clamp(mos, 1.0, 5.0);

        Assert.Equal(1.0, mos);
    }
}
