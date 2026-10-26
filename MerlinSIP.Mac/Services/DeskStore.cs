using System.Text.Json;

namespace MerlinSip.Mac;

public sealed class DeskStore
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public DeskStore()
    {
        Directory.CreateDirectory(DirectoryPath);
        Directory.CreateDirectory(RecordingsPath);
        Config = Read<DeskConfig>("settings.json") ?? new DeskConfig();
        Contacts = Read<List<DeskContact>>("contacts.json") ?? [];
        History = Read<List<DeskCall>>("history.json") ?? [];
        Messages = Read<List<DeskMessage>>("messages.json") ?? [];
    }

    public string DirectoryPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MerlinSIP");

    public string RecordingsPath => Path.Combine(DirectoryPath, "Recordings");
    public string LogPath => Path.Combine(DirectoryPath, "debug.log");

    public DeskConfig Config { get; private set; }
    public List<DeskContact> Contacts { get; }
    public List<DeskCall> History { get; }
    public List<DeskMessage> Messages { get; }

    public void SaveConfig() => Write("settings.json", Config);

    public void SaveContacts() => Write("contacts.json", Contacts);

    public void SaveHistory() => Write("history.json", History);

    public void SaveMessages() => Write("messages.json", Messages);

    public void AddHistory(DeskCall call)
    {
        History.Insert(0, call);
        if (History.Count > 300)
        {
            History.RemoveRange(300, History.Count - 300);
        }

        SaveHistory();
    }

    public void AddMessage(DeskMessage message)
    {
        Messages.Insert(0, message);
        if (Messages.Count > 500)
        {
            Messages.RemoveRange(500, Messages.Count - 500);
        }

        SaveMessages();
    }

    public string LookupName(string number)
    {
        var match = Contacts.FirstOrDefault(item =>
            string.Equals(item.Number, number, StringComparison.OrdinalIgnoreCase));
        return string.IsNullOrWhiteSpace(match?.Name) ? number : match.Name;
    }

    private T? Read<T>(string file)
    {
        var path = Path.Combine(DirectoryPath, file);
        if (!File.Exists(path))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Json);
        }
        catch (Exception ex)
        {
            DeskLog.Write($"Could not read {file}: {ex.Message}");
            return default;
        }
    }

    private void Write<T>(string file, T value)
    {
        var path = Path.Combine(DirectoryPath, file);
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(value, Json));
        File.Move(temp, path, true);
    }
}

public static class DeskLog
{
    private static readonly object Gate = new();
    private static readonly List<string> Lines = [];
    private static string _path = Path.Combine(Path.GetTempPath(), "merlin-sip.log");

    public static void Bind(string path) => _path = path;

    public static void Write(string message)
    {
        var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}  {message}";
        lock (Gate)
        {
            Lines.Add(line);
            if (Lines.Count > 400)
            {
                Lines.RemoveRange(0, Lines.Count - 400);
            }

            try
            {
                var directory = Path.GetDirectoryName(_path);
                if (!string.IsNullOrWhiteSpace(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                File.AppendAllText(_path, line + Environment.NewLine);
            }
            catch
            {
                // Logging must not take the phone down.
            }
        }
    }

    public static string Recent()
    {
        lock (Gate)
        {
            return string.Join(Environment.NewLine, Lines);
        }
    }
}
