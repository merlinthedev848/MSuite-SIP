using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class ContactImportTests
{
    [Fact]
    public void Csv_WithHeaders_SuggestsColumnsAndKeepsQuotedValues()
    {
        var path = WriteTemp("contacts.csv", """
            Name,Phone,Company,Notes,Favorite
            "Alex Hisley",807,"DID, Secure","Front desk",yes
            Danny Myers,709,2B Print,,no
            """);

        var sheet = ContactImportReader.Read(path);
        Assert.Equal(0, sheet.NameColumn);
        Assert.Equal(1, sheet.NumberColumn);
        Assert.Equal(2, sheet.CompanyColumn);
        Assert.Equal(2, sheet.Rows.Count);

        var contacts = ContactImportReader.Map(sheet, Map(sheet));
        Assert.Equal("Alex Hisley", contacts[0].Name);
        Assert.Equal("807", contacts[0].Number);
        Assert.Equal("DID, Secure", contacts[0].Company);
        Assert.True(contacts[0].IsFavorite);
        Assert.False(contacts[1].IsFavorite);
    }

    [Fact]
    public void Csv_WithoutHeaders_UsesColumnNumbers()
    {
        var path = WriteTemp("plain.csv", """
            Alex,807,DID Secure
            Danny,709,2B Print
            """);

        var sheet = ContactImportReader.Read(path);
        Assert.Equal("Column 1", sheet.Columns[0]);
        Assert.Equal(-1, sheet.NameColumn);
        Assert.Equal(2, sheet.Rows.Count);

        var contacts = ContactImportReader.Map(sheet, new ContactColumnMap { Name = 0, Number = 1, Company = 2 });
        Assert.Equal("Danny", contacts[1].Name);
        Assert.Equal("709", contacts[1].Number);
    }

    [Fact]
    public void Csv_SemicolonFile_SplitsOnSemicolons()
    {
        var path = WriteTemp("eu.csv", "Name;Number;Company\r\nAlex;807;DID\r\n");
        var sheet = ContactImportReader.Read(path);
        Assert.Equal(["Name", "Number", "Company"], sheet.Columns);
        Assert.Equal("807", sheet.Rows[0][1]);
    }

    [Fact]
    public void Xml_DirectoryEntries_UseChildElementsAsColumns()
    {
        var path = WriteTemp("book.xml", """
            <?xml version="1.0" encoding="utf-8"?>
            <YeastarIPPhoneDirectory>
              <DirectoryEntry>
                <Name>Alex Hisley</Name>
                <Telephone>807</Telephone>
                <Department>Secure</Department>
              </DirectoryEntry>
              <DirectoryEntry>
                <Name>Danny Myers</Name>
                <Telephone>709</Telephone>
                <Department>Print</Department>
              </DirectoryEntry>
            </YeastarIPPhoneDirectory>
            """);

        var sheet = ContactImportReader.Read(path);
        Assert.Equal(2, sheet.Rows.Count);
        Assert.Contains("Telephone", sheet.Columns);
        Assert.Equal(sheet.Columns.ToList().IndexOf("Telephone"), sheet.NumberColumn);

        var contacts = ContactImportReader.Map(sheet, Map(sheet));
        Assert.Equal("Alex Hisley", contacts[0].Name);
        Assert.Equal("807", contacts[0].Number);
        Assert.Equal("Secure", contacts[0].Company);
    }

    [Fact]
    public void Xml_AttributesAndSplitNames_CanBeMapped()
    {
        var path = WriteTemp("attrs.xml", """
            <contacts>
              <contact firstName="Alex" lastName="Hisley" mobile="807" company="DID" favorite="true" />
              <contact firstName="Danny" lastName="Myers" mobile="709" company="Print" favorite="false" />
            </contacts>
            """);

        var sheet = ContactImportReader.Read(path);
        Assert.Contains("First name + Last name", sheet.Columns);
        Assert.Equal("Alex Hisley", sheet.Rows[0][sheet.NameColumn]);

        var contacts = ContactImportReader.Map(sheet, Map(sheet));
        Assert.Equal("Alex Hisley", contacts[0].Name);
        Assert.Equal("807", contacts[0].Number);
        Assert.True(contacts[0].IsFavorite);
    }

    private static ContactColumnMap Map(ContactImportSheet sheet)
    {
        return new ContactColumnMap
        {
            Name = sheet.NameColumn,
            Number = sheet.NumberColumn,
            Company = sheet.CompanyColumn,
            Notes = sheet.NotesColumn,
            Favorite = sheet.FavoriteColumn
        };
    }

    private static string WriteTemp(string name, string contents)
    {
        var path = Path.Combine(Path.GetTempPath(), $"merlin-import-{Guid.NewGuid():N}-{name}");
        File.WriteAllText(path, contents);
        return path;
    }
}
