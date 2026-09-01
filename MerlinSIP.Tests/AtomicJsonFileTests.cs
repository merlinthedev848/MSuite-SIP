using System.Text.Json;
using MerlinSip.Services;

namespace MerlinSip.Tests;

[TestClass]
public sealed class AtomicJsonFileTests
{
    [TestMethod]
    public async Task WriteAsync_ReplacesExistingFileWithCompleteJson()
    {
        var directory = Path.Combine(Path.GetTempPath(), "MerlinSIP.Tests", Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "settings.json");

        try
        {
            await AtomicJsonFile.WriteAsync(path, new TestPayload("first", 1), new JsonSerializerOptions());
            await AtomicJsonFile.WriteAsync(path, new TestPayload("second", 2), new JsonSerializerOptions());

            var json = await File.ReadAllTextAsync(path);
            var payload = JsonSerializer.Deserialize<TestPayload>(json);

            Assert.IsNotNull(payload);
            Assert.AreEqual("second", payload!.Name);
            Assert.AreEqual(2, payload.Value);
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }

    private sealed record TestPayload(string Name, int Value);
}
