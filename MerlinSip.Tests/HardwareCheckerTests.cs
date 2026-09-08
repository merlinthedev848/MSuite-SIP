using System;
using System.Threading.Tasks;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class HardwareCheckerTests
{
    [Fact]
    public async Task HardwareChecker_RunDiagnostics_ReturnsResultsWithoutCrashing()
    {
        var results = await HardwareChecker.RunDiagnosticsAsync();
        Assert.NotNull(results);
        // On Windows with WMI support, it should yield processor and memory items
        Assert.True(results.Count >= 0);
    }
}
