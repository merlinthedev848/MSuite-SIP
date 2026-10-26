using System.Text.Json;

namespace MerlinSip.Mobile;

public sealed class SipAccount
{
    public string DisplayName { get; set; } = "";
    public string Server { get; set; } = "";
    public int Port { get; set; } = 5060;
    public string Domain { get; set; } = "";
    public string Extension { get; set; } = "";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";

    public string ResolvedDomain => string.IsNullOrWhiteSpace(Domain) ? Server : Domain.Trim();
    public string AuthUsername => string.IsNullOrWhiteSpace(Username) ? Extension.Trim() : Username.Trim();
}

public sealed class PhoneContact
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Number { get; set; } = "";
}

public sealed class CallRecord
{
    public string Number { get; set; } = "";
    public string Direction { get; set; } = "Out";
    public string Result { get; set; } = "";
    public DateTimeOffset At { get; set; } = DateTimeOffset.Now;
    public int Seconds { get; set; }
}

public static class PhoneData
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static string _directory = "";

    public static SipAccount? Account { get; private set; }
    public static List<PhoneContact> Contacts { get; } = new();
    public static List<CallRecord> History { get; } = new();

    public static void Load(string directory)
    {
        _directory = directory;
        Directory.CreateDirectory(directory);
        Account = Read<SipAccount>("account.json");
        Contacts.Clear();
        Contacts.AddRange(Read<List<PhoneContact>>("contacts.json") ?? new List<PhoneContact>());
        History.Clear();
        History.AddRange(Read<List<CallRecord>>("history.json") ?? new List<CallRecord>());
    }

    public static void SaveAccount(SipAccount account)
    {
        Account = account;
        Write("account.json", account);
    }

    public static void ClearAccount()
    {
        Account = null;
        var path = Path.Combine(_directory, "account.json");
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    public static void SaveContacts() => Write("contacts.json", Contacts);

    public static void AddHistory(CallRecord record)
    {
        History.Insert(0, record);
        if (History.Count > 100)
        {
            History.RemoveRange(100, History.Count - 100);
        }

        Write("history.json", History);
    }

    private static T? Read<T>(string file)
    {
        var path = Path.Combine(_directory, file);
        if (!File.Exists(path))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Json);
        }
        catch
        {
            return default;
        }
    }

    private static void Write<T>(string file, T value)
    {
        var path = Path.Combine(_directory, file);
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(value, Json));
        File.Move(temp, path, true);
    }
}
