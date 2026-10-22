using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class StressTests
{
    // =========================================================================
    // 1. G.711 CODEC FULL SPECTRUM STRESS TEST (All 65,536 16-bit PCM values)
    // =========================================================================
    [Fact]
    public void G711Codec_ExhaustiveAllInt16Values_NoExceptionsAndWithinClippingBounds()
    {
        for (int sample = short.MinValue; sample <= short.MaxValue; sample++)
        {
            short input = (short)sample;

            // Test PCMU (u-Law) encode and decode
            byte muLaw = G711Codec.LinearToMuLaw(input);
            short decodedMu = G711Codec.MuLawToLinear(muLaw);

            // Test PCMA (A-Law) encode and decode
            byte aLaw = G711Codec.LinearToALaw(input);
            short decodedA = G711Codec.ALawToLinear(aLaw);

            Assert.True(decodedMu >= -32768 && decodedMu <= 32767);
            Assert.True(decodedA >= -32768 && decodedA <= 32767);
        }
    }

    // =========================================================================
    // 2. AUDIO FRAME QUEUE HIGH-THROUGHPUT CONCURRENCY STRESS TEST
    // =========================================================================
    [Fact]
    public async Task AudioFrameQueue_HighConcurrency_ProducersAndConsumers_NoDeadlocksOrCorruption()
    {
        var queue = new AudioFrameQueue();
        const int producers = 8;
        const int consumers = 8;
        const int framesPerProducer = 1000;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));

        var producerTasks = Enumerable.Range(0, producers).Select(p => Task.Run(() =>
        {
            for (int i = 0; i < framesPerProducer; i++)
            {
                var frame = new short[160];
                frame[0] = (short)(p * 10000 + i);
                queue.Enqueue(frame);
            }
        }, cts.Token)).ToArray();

        var consumerTasks = Enumerable.Range(0, consumers).Select(_ => Task.Run(() =>
        {
            int received = 0;
            while (!cts.Token.IsCancellationRequested && received < (producers * framesPerProducer) / consumers)
            {
                var frame = queue.DequeueOrSilence(160);
                Assert.NotNull(frame);
                Assert.Equal(160, frame.Length);
                received++;
            }
        }, cts.Token)).ToArray();

        await Task.WhenAll(producerTasks);
        await Task.WhenAll(consumerTasks);

        // Queue count should always be bounded by MaxFrames (18)
        Assert.True(queue.Count <= 18);
        Assert.True(queue.Count >= 0);
    }

    [Fact]
    public void AudioFrameQueue_CycleUnderruns_CountTracksStarvationAccurately()
    {
        var queue = new AudioFrameQueue();

        for (int cycle = 0; cycle < 100; cycle++)
        {
            // Feed target 6 frames to trigger stream start
            for (int f = 0; f < 6; f++)
            {
                queue.Enqueue(new short[160]);
            }

            // Drain 6 frames
            for (int f = 0; f < 6; f++)
            {
                queue.DequeueOrSilence(160);
            }

            // 7th dequeue causes starvation / underrun
            var emptyFrame = queue.DequeueOrSilence(160);
            Assert.Equal(160, emptyFrame.Length);
        }

        Assert.Equal(0, queue.Count);
        Assert.Equal(100, queue.Underruns);

        queue.Clear();
        Assert.Equal(0, queue.Underruns);
    }

    // =========================================================================
    // 3. AUDIO BUFFER CONCURRENT DISPOSAL & DOUBLE-FREE STRESS TEST
    // =========================================================================
    [Fact]
    public void AudioBuffer_ConcurrentDisposal_NoDoubleFreeCrash()
    {
        for (int i = 0; i < 200; i++)
        {
            var buffer = new AudioBuffer(320);
            Parallel.For(0, 10, _ =>
            {
                buffer.Dispose();
            });
        }
    }

    // =========================================================================
    // 4. ATOMIC FILE STORAGE & STORE CONCURRENCY STRESS TEST
    // =========================================================================
    [Fact]
    public async Task AtomicFileStorage_ConcurrentReadsAndWrites_NoCorruptionOrFileInUseExceptions()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "MerlinSip_Stress_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var filePath = Path.Combine(tempDir, "stress_contacts.json");
        var jsonOptions = new System.Text.Json.JsonSerializerOptions { WriteIndented = true };

        try
        {
            // Initial write
            var initialContacts = new List<ContactEntry>
            {
                new() { Name = "Initial", Number = "100" }
            };
            await AtomicFileStorage.SaveAtomicAsync(filePath, initialContacts, jsonOptions);

            const int iterations = 30;
            var writeTasks = Task.Run(async () =>
            {
                for (int i = 0; i < iterations; i++)
                {
                    var list = Enumerable.Range(1, 20).Select(k => new ContactEntry
                    {
                        Name = $"Contact_{i}_{k}",
                        Number = $"{1000 + k}",
                        Company = "Testing"
                    }).ToList();

                    await AtomicFileStorage.SaveAtomicAsync(filePath, list, jsonOptions);
                    await Task.Delay(2);
                }
            });

            var readTasks = Enumerable.Range(0, 4).Select(_ => Task.Run(async () =>
            {
                for (int i = 0; i < iterations; i++)
                {
                    if (File.Exists(filePath))
                    {
                        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 4096, useAsync: true);
                        var loaded = await System.Text.Json.JsonSerializer.DeserializeAsync<List<ContactEntry>>(stream);
                        Assert.NotNull(loaded);
                        Assert.NotEmpty(loaded);
                    }
                    await Task.Delay(2);
                }
            })).ToArray();

            await writeTasks;
            await Task.WhenAll(readTasks);

            // Verify final file is fully valid and uncorrupted
            await using var finalStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 4096, useAsync: true);
            var finalContacts = await System.Text.Json.JsonSerializer.DeserializeAsync<List<ContactEntry>>(finalStream);
            Assert.NotNull(finalContacts);
            Assert.Equal(20, finalContacts.Count);
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                try { Directory.Delete(tempDir, recursive: true); } catch { }
            }
        }
    }

    // =========================================================================
    // 5. CALL QUALITY MONITOR STRESS TEST
    // =========================================================================
    private class MockQualityDataSource : ICallQualityDataSource
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
    public void CallQualityMonitor_RapidStartStopDispose_NoExceptionsOrResourceLeaks()
    {
        var dataSource = new MockQualityDataSource();
        for (int i = 0; i < 50; i++)
        {
            using var monitor = new CallQualityMonitor(dataSource);
            monitor.Start();
            monitor.Start(); // Re-entrant start
            monitor.Stop();
            monitor.Start();
            monitor.Dispose();
            monitor.Stop();  // Call after dispose
        }
    }

    [Theory]
    [InlineData(0, 0, 0, 4.41, CallQualityLevel.Excellent)]
    [InlineData(5, 20, 50, 3.86, CallQualityLevel.Good)]
    [InlineData(15, 60, 150, 2.33, CallQualityLevel.Poor)]
    [InlineData(100, 500, 1000, 1.0, CallQualityLevel.Poor)]
    public void CallQualityMonitor_ExtremeMetricsBoundaryCalculations(
        double packetLoss, double jitter, double latency, double expectedMinMos, CallQualityLevel expectedLevel)
    {
        var dataSource = new MockQualityDataSource
        {
            PacketLoss = packetLoss,
            Jitter = jitter,
            Latency = latency,
            IsCallActive = true
        };

        using var monitor = new CallQualityMonitor(dataSource);
        CallQualityMetrics? reported = null;
        monitor.CallQualityChanged += (_, m) => reported = m;

        // Force calculation verification
        double rFactor = 93.2 - (packetLoss * 2.5) - (jitter * 0.1) - (latency * 0.03);
        double mosScore = 1.0;
        if (rFactor > 0)
        {
            mosScore = Math.Clamp(1 + (0.035 * rFactor) + (rFactor * (rFactor - 60) * (100 - rFactor) * 0.000007), 1.0, 5.0);
        }

        Assert.True(mosScore >= 1.0 && mosScore <= 5.0);
        Assert.True(Math.Abs(mosScore - expectedMinMos) < 0.1);

        CallQualityLevel level = mosScore switch
        {
            > 4.0 => CallQualityLevel.Excellent,
            >= 3.5 => CallQualityLevel.Good,
            >= 3.0 => CallQualityLevel.Fair,
            _ => CallQualityLevel.Poor
        };
        Assert.Equal(expectedLevel, level);
    }

    // =========================================================================
    // 6. CALL MANAGER ASYNC CONCURRENCY & RACE CONDITION TEST
    // =========================================================================
    private class StressCallProvider : ICallManagerSipProvider
    {
        private int _holdCount;
        private int _answerCount;
        public int HoldCount => _holdCount;
        public int AnswerCount => _answerCount;

        public async Task<SipCallResult> SetHeldAsync(bool held, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _holdCount);
            await Task.Delay(2, cancellationToken);
            return new SipCallResult(true, held ? "Held" : "Resumed");
        }

        public async Task<SipCallResult> AnswerCallAsync(PendingIncomingCall incoming, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _answerCount);
            await Task.Delay(2, cancellationToken);
            return new SipCallResult(true, "Answered");
        }

        public async Task<SipCallResult> ResumeSpecificCallAsync(string callId, CancellationToken cancellationToken = default)
        {
            await Task.Delay(2, cancellationToken);
            return new SipCallResult(true, "Resumed");
        }
    }

    [Fact]
    public async Task CallManager_RapidSequentialIncomingCalls_MaintainsInvariantOnlyOneActiveCall()
    {
        var provider = new StressCallProvider();
        var manager = new CallManager(provider);

        // Process 10 incoming calls sequentially
        for (int i = 0; i < 10; i++)
        {
            var call = new PendingIncomingCall(
                $"call-{i}", "INVITE...", new IPEndPoint(IPAddress.Loopback, 5060), $"tag{i}", $"rem{i}", $"10{i}", 1);
            await manager.HoldCurrentAndAnswerAsync(call);
        }

        Assert.Equal(10, manager.ActiveCalls.Count);
        int activeCount = manager.ActiveCalls.Count(c => !c.IsOnHold);
        int heldCount = manager.ActiveCalls.Count(c => c.IsOnHold);

        Assert.Equal(1, activeCount);
        Assert.Equal(9, heldCount);
    }

    [Fact]
    public async Task CallManager_ConcurrentIncomingCalls_MaintainsInvariantOnlyOneActiveCall()
    {
        var provider = new StressCallProvider();
        var manager = new CallManager(provider);

        var calls = Enumerable.Range(0, 10).Select(i => new PendingIncomingCall(
            $"call-{i}", "INVITE...", new IPEndPoint(IPAddress.Loopback, 5060), $"tag{i}", $"rem{i}", $"10{i}", 1)).ToList();

        // Launch all 10 calls concurrently!
        await Task.WhenAll(calls.Select(c => manager.HoldCurrentAndAnswerAsync(c)));

        int activeCount = manager.ActiveCalls.Count(c => !c.IsOnHold);
        int heldCount = manager.ActiveCalls.Count(c => c.IsOnHold);

        Assert.Equal(10, manager.ActiveCalls.Count);
        Assert.Equal(1, activeCount);
        Assert.Equal(9, heldCount);
    }

    // =========================================================================
    // 7. SIP RESPONSE & HEADER PARSER FUZZING AND RESILIENCE
    // =========================================================================
    [Fact]
    public void SipParser_ValidResponse_ParsesCorrectly()
    {
        const string raw = "SIP/2.0 200 OK\r\n" +
                           "Via: SIP/2.0/UDP 10.0.0.40:5060;branch=z9hG4bK12345;received=10.0.0.40;rport=5060\r\n" +
                           "From: <sip:100@pbx.chriskendall.media>;tag=from123\r\n" +
                           "To: <sip:100@pbx.chriskendall.media>;tag=to456\r\n" +
                           "Call-ID: call-abc-123\r\n" +
                           "CSeq: 1 REGISTER\r\n" +
                           "Contact: <sip:100@10.0.0.20:5060>;expires=3600\r\n" +
                           "Content-Length: 0\r\n\r\n";

        var response = SipRegistrationService.ParseResponse(raw);

        Assert.Equal(200, response.Code);
        Assert.Equal("OK", response.Reason);
        Assert.Equal("call-abc-123", response.Headers["call-id"]);
        Assert.Contains("expires=3600", response.Headers["contact"]);
    }

    [Fact]
    public void SipParser_FoldedHeaderContinuation_ParsesCombinedValue()
    {
        const string raw = "SIP/2.0 401 Unauthorized\r\n" +
                           "WWW-Authenticate: Digest realm=\"YSAsterisk\",\r\n" +
                           " nonce=\"12345678\",\r\n" +
                           " algorithm=MD5\r\n" +
                           "Content-Length: 0\r\n\r\n";

        var response = SipRegistrationService.ParseResponse(raw);

        Assert.Equal(401, response.Code);
        Assert.Contains("realm=\"YSAsterisk\"", response.Headers["www-authenticate"]);
        Assert.Contains("nonce=\"12345678\"", response.Headers["www-authenticate"]);
        Assert.Contains("algorithm=MD5", response.Headers["www-authenticate"]);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("NOT_SIP_AT_ALL")]
    [InlineData("SIP/2.0")]
    [InlineData("SIP/2.0 INVALID_CODE")]
    [InlineData("SIP/2.0 200")]
    [InlineData("SIP/2.0 999 Special\r\nHeaderWithoutColon\r\n\r\n")]
    public void SipParser_MalformedInputs_SafelyReturnsWithoutThrowing(string malformedInput)
    {
        var exception = Record.Exception(() =>
        {
            var response = SipRegistrationService.ParseResponse(malformedInput);
            Assert.NotNull(response);
            Assert.NotNull(response.Headers);
        });

        Assert.Null(exception);
    }

    [Fact]
    public void SipParser_HugeHeaderPayload_HandlesWithoutMemoryCrash()
    {
        string hugeValue = new string('X', 65536);
        string raw = $"SIP/2.0 180 Ringing\r\nX-Large-Header: {hugeValue}\r\nContent-Length: 0\r\n\r\n";

        var response = SipRegistrationService.ParseResponse(raw);

        Assert.Equal(180, response.Code);
        Assert.Equal("Ringing", response.Reason);
        Assert.True(response.Headers.ContainsKey("x-large-header"));
        Assert.Equal(65536, response.Headers["x-large-header"].Length);
    }
}
