namespace MerlinSip.Services;

using System;
using System.Threading;
using System.Threading.Tasks;
using MerlinSip.Models;

/// <summary>
/// Provides real-time RTP statistics required for call quality calculation.
/// </summary>
public interface ICallQualityDataSource
{
    double GetPacketLossPercentage();
    double GetJitterMs();
    double GetLatencyMs();
    bool IsCallActive { get; }
}

/// <summary>
/// Monitors live call quality metrics based on RTP statistics.
/// The MOS value is an application estimate, not a standards-certified measurement.
/// </summary>
public sealed class CallQualityMonitor : IDisposable
{
    private static readonly TimeSpan SampleInterval = TimeSpan.FromSeconds(2);
    private readonly ICallQualityDataSource _dataSource;
    private readonly object _sync = new();
    private CancellationTokenSource? _monitorCancellation;
    private CancellationTokenSource? _linkedCancellation;
    private Task? _monitorTask;
    private bool _disposed;

    public event EventHandler<CallQualityMetrics>? CallQualityChanged;

    public CallQualityMonitor(ICallQualityDataSource dataSource)
    {
        _dataSource = dataSource ?? throw new ArgumentNullException(nameof(dataSource));
    }

    public void Start(CancellationToken cancellationToken = default)
    {
        lock (_sync)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            StopLocked();

            _monitorCancellation = new CancellationTokenSource();
            _linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(
                cancellationToken,
                _monitorCancellation.Token);

            _monitorTask = MonitorLoopAsync(_linkedCancellation.Token);
        }
    }

    public void Stop()
    {
        lock (_sync)
        {
            StopLocked();
        }
    }

    private void StopLocked()
    {
        _monitorCancellation?.Cancel();
        _monitorCancellation?.Dispose();
        _monitorCancellation = null;

        _linkedCancellation?.Cancel();
        _linkedCancellation?.Dispose();
        _linkedCancellation = null;
        _monitorTask = null;
    }

    private async Task MonitorLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                if (_dataSource.IsCallActive)
                {
                    try
                    {
                        var metrics = CalculateCurrentMetrics();
                        CallQualityChanged?.Invoke(this, metrics);
                    }
                    catch (Exception error)
                    {
                        DebugLog.Write($"CALL QUALITY sample failed error={error.Message}");
                    }
                }

                await Task.Delay(SampleInterval, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Expected during Stop/Dispose.
        }
        catch (Exception error)
        {
            DebugLog.Write($"CALL QUALITY monitor stopped unexpectedly error={error.Message}");
        }
    }

    private CallQualityMetrics CalculateCurrentMetrics()
    {
        var packetLoss = ClampFinite(_dataSource.GetPacketLossPercentage(), 0, 100);
        var jitterMs = ClampFinite(_dataSource.GetJitterMs(), 0, 10_000);
        var latencyMs = ClampFinite(_dataSource.GetLatencyMs(), 0, 60_000);

        // This is intentionally a lightweight UI estimate. It should not be presented
        // as an ITU-T-certified MOS calculation without the missing codec/network factors.
        var rFactor = Math.Clamp(
            93.2 - (packetLoss * 2.5) - (jitterMs * 0.1) - (latencyMs * 0.03),
            0,
            100);

        var mosScore = 1 +
                       (0.035 * rFactor) +
                       (rFactor * (rFactor - 60) * (100 - rFactor) * 0.000007);
        mosScore = Math.Clamp(mosScore, 1.0, 5.0);

        var level = mosScore switch
        {
            > 4.0 => CallQualityLevel.Excellent,
            >= 3.5 => CallQualityLevel.Good,
            >= 3.0 => CallQualityLevel.Fair,
            _ => CallQualityLevel.Poor
        };

        return new CallQualityMetrics
        {
            MosScore = Math.Round(mosScore, 2),
            Level = level,
            Jitter = Math.Round(jitterMs, 2),
            PacketLoss = Math.Round(packetLoss, 2),
            Latency = Math.Round(latencyMs, 2)
        };
    }

    private static double ClampFinite(double value, double minimum, double maximum)
    {
        return double.IsFinite(value) ? Math.Clamp(value, minimum, maximum) : maximum;
    }

    public void Dispose()
    {
        lock (_sync)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            StopLocked();
        }

        GC.SuppressFinalize(this);
    }
}
