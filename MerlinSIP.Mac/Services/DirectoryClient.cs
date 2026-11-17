using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace MerlinSip.Mac;

/// <summary>
/// Pulls the handler shared address book for this extension. Local contacts stay.
/// Numbers that are not already on the phone are added.
/// </summary>
public static class DirectoryClient
{
    public static async Task<int> MergeAsync(DeskStore store, CancellationToken cancellationToken = default)
    {
        var config = store.Config;
        var extension = config.Extension.Trim();
        if (extension.Length == 0 || string.IsNullOrWhiteSpace(config.Password))
        {
            return 0;
        }

        var handler = string.IsNullOrWhiteSpace(config.DataHandlerUrl)
            ? "https://handler.chriskendall.media"
            : config.DataHandlerUrl.Trim().TrimEnd('/');
        if (!Uri.TryCreate(handler, UriKind.Absolute, out var baseUri) ||
            (baseUri.Scheme != Uri.UriSchemeHttps && baseUri.Scheme != Uri.UriSchemeHttp))
        {
            return 0;
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            new Uri(baseUri, "/api/v1/contacts?extension=" + Uri.EscapeDataString(extension)));
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{config.AuthUsername}:{config.Password}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        request.Headers.TryAddWithoutValidation("User-Agent", "MerlinSIP-Mac/" + AppVersion.Current);

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return 0;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("contacts", out var contacts) || contacts.ValueKind != JsonValueKind.Array)
        {
            return 0;
        }

        var changed = 0;
        foreach (var item in contacts.EnumerateArray())
        {
            var number = ReadString(item, "extension");
            if (number.Length == 0)
            {
                number = ReadString(item, "phone");
            }
            if (number.Length == 0)
            {
                continue;
            }

            var name = ReadString(item, "name");
            var company = ReadString(item, "address_book_name");
            if (company.Length == 0)
            {
                company = ReadString(item, "company");
            }
            if (company.Length == 0)
            {
                company = "Shared Address Book";
            }

            var existing = store.Contacts.FirstOrDefault(contact =>
                string.Equals(contact.Number, number, StringComparison.OrdinalIgnoreCase));
            if (existing == null)
            {
                store.Contacts.Add(new DeskContact
                {
                    Name = name.Length == 0 ? "Ext " + number : name,
                    Number = number,
                    Company = company
                });
                changed++;
                continue;
            }

            if (name.Length > 0 &&
                (existing.Name.Length == 0 || existing.Name.StartsWith("Ext ", StringComparison.OrdinalIgnoreCase)))
            {
                existing.Name = name;
                if (existing.Company.Length == 0)
                {
                    existing.Company = company;
                }
                changed++;
            }
        }

        if (changed > 0)
        {
            store.SaveContacts();
        }

        return changed;
    }

    private static string ReadString(JsonElement item, string name)
    {
        if (!item.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return "";
        }

        return value.GetString()?.Trim() ?? "";
    }
}
