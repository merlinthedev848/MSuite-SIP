using Xunit;
using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip.Tests;

public class DtmfTonePlayerTests
{
    [Theory]
    [InlineData('0')]
    [InlineData('1')]
    [InlineData('2')]
    [InlineData('3')]
    [InlineData('4')]
    [InlineData('5')]
    [InlineData('6')]
    [InlineData('7')]
    [InlineData('8')]
    [InlineData('9')]
    [InlineData('*')]
    [InlineData('#')]
    [InlineData('A')]
    [InlineData('B')]
    [InlineData('C')]
    [InlineData('D')]
    public void GetTonePcm_ReturnsValidSampledBuffer(char digit)
    {
        var pcm = DtmfTonePlayer.GetTonePcm(digit);
        Assert.NotNull(pcm);
        // 8000 Hz, 16-bit mono = 16 bytes per ms. 120ms = 1920 bytes.
        Assert.Equal(1920, pcm.Length);
    }

    [Fact]
    public void AppStartupConfig_HasCorrectDefaultFeatureCodes()
    {
        var config = new AppStartupConfig(
            "pbx.example.com", 5060, "pbx.example.com", "101", "user101", "pass",
            "LIC", "Licensed",
            new MediaDeviceInfo("in", "Input"),
            new MediaDeviceInfo("out", "Output"));

        Assert.Equal("*2", config.VoicemailNumber);
        Assert.Equal("*4", config.CallPickupPrefix);
    }
}
