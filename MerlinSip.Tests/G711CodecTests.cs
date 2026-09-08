using System;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class G711CodecTests
{
    [Fact]
    public void MuLaw_BoundaryValues_EncodeAndDecodeWithoutException()
    {
        short[] extremes = [short.MinValue, -32767, -16384, -1, 0, 1, 16384, 32766, short.MaxValue];
        foreach (var sample in extremes)
        {
            var encoded = G711Codec.LinearToMuLaw(sample);
            var decoded = G711Codec.MuLawToLinear(encoded);
            Assert.True(decoded >= -32768 && decoded <= 32767);
        }
    }

    [Fact]
    public void ALaw_BoundaryValues_EncodeAndDecodeWithoutException()
    {
        short[] extremes = [short.MinValue, -32767, -16384, -1, 0, 1, 16384, 32766, short.MaxValue];
        foreach (var sample in extremes)
        {
            var encoded = G711Codec.LinearToALaw(sample);
            var decoded = G711Codec.ALawToLinear(encoded);
            Assert.True(decoded >= -32768 && decoded <= 32767);
        }
    }

    [Fact]
    public void MuLaw_Full16BitRange_NoExceptions()
    {
        for (int i = short.MinValue; i <= short.MaxValue; i += 257)
        {
            var sample = (short)i;
            var encoded = G711Codec.LinearToMuLaw(sample);
            var decoded = G711Codec.MuLawToLinear(encoded);
            var error = Math.Abs((int)sample - (int)decoded);
            var maxError = Math.Max(32, Math.Abs((long)sample) * 0.10);
            Assert.True(error <= maxError, $"MuLaw quantization error too large for sample {sample}: decoded={decoded}, error={error}");
        }
    }

    [Fact]
    public void ALaw_Full16BitRange_NoExceptions()
    {
        for (int i = short.MinValue; i <= short.MaxValue; i += 257)
        {
            var sample = (short)i;
            var encoded = G711Codec.LinearToALaw(sample);
            var decoded = G711Codec.ALawToLinear(encoded);
            var error = Math.Abs((int)sample - (int)decoded);
            var maxError = Math.Max(32, Math.Abs((long)sample) * 0.10);
            Assert.True(error <= maxError, $"ALaw quantization error too large for sample {sample}: decoded={decoded}, error={error}");
        }
    }

    [Fact]
    public void ZeroInput_EncodesToStandardZeroPattern()
    {
        var muZero = G711Codec.LinearToMuLaw(0);
        var aZero = G711Codec.LinearToALaw(0);
        
        Assert.Equal(0xFF, muZero);
        Assert.Equal(0x55, aZero);
        Assert.Equal(8, G711Codec.ALawToLinear(aZero)); // 8 is the ITU-T G.711 interval midpoint for [0..16]
        Assert.Equal(0, G711Codec.MuLawToLinear(muZero));
    }
}
