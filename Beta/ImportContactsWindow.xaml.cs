using System.Data;
using System.Windows;
using System.Windows.Input;
using WpfComboBox = System.Windows.Controls.ComboBox;
using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip;

public partial class ImportContactsWindow : Window
{
    private readonly ContactImportSheet _sheet;

    public IReadOnlyList<ContactEntry> ImportedContacts { get; private set; } = [];
    public bool UpdateExisting { get; private set; }

    public ImportContactsWindow(ContactImportSheet sheet, string fileName)
    {
        InitializeComponent();
        _sheet = sheet;
        FileText.Text = sheet.Truncated
            ? $"{fileName}  ·  first {ContactImportReader.MaxRows:N0} rows"
            : $"{fileName}  ·  {sheet.Rows.Count:N0} rows, {sheet.Columns.Count:N0} columns";

        var options = new List<ColumnOption> { new(-1, "(Skip)") };
        for (var index = 0; index < sheet.Columns.Count; index++)
        {
            options.Add(new ColumnOption(index, sheet.Columns[index]));
        }

        BindCombo(NameColumnCombo, options, sheet.NameColumn);
        BindCombo(NumberColumnCombo, options, sheet.NumberColumn);
        BindCombo(CompanyColumnCombo, options, sheet.CompanyColumn);
        BindCombo(NotesColumnCombo, options, sheet.NotesColumn);
        BindCombo(FavoriteColumnCombo, options, sheet.FavoriteColumn);
        LoadPreview();
        UpdateImportState();
    }

    private static void BindCombo(WpfComboBox combo, IReadOnlyList<ColumnOption> options, int selectedIndex)
    {
        combo.ItemsSource = options;
        combo.SelectedValue = selectedIndex;
        if (combo.SelectedValue is null)
        {
            combo.SelectedIndex = 0;
        }
    }

    private void LoadPreview()
    {
        var table = new DataTable();
        foreach (var column in _sheet.Columns)
        {
            var name = column;
            var suffix = 2;
            while (table.Columns.Contains(name))
            {
                name = $"{column} ({suffix})";
                suffix++;
            }

            table.Columns.Add(name);
        }

        foreach (var row in _sheet.Rows.Take(8))
        {
            var values = new object[table.Columns.Count];
            for (var index = 0; index < values.Length; index++)
            {
                values[index] = index < row.Length ? row[index] : "";
            }

            table.Rows.Add(values);
        }

        PreviewGrid.ItemsSource = table.DefaultView;
    }

    private void ImportButton_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedIndex(NumberColumnCombo) < 0)
        {
            StatusText.Text = "Choose the column that contains the phone number.";
            return;
        }

        var contacts = ContactImportReader.Map(_sheet, new ContactColumnMap
        {
            Name = SelectedIndex(NameColumnCombo),
            Number = SelectedIndex(NumberColumnCombo),
            Company = SelectedIndex(CompanyColumnCombo),
            Notes = SelectedIndex(NotesColumnCombo),
            Favorite = SelectedIndex(FavoriteColumnCombo)
        });

        if (contacts.Count == 0)
        {
            StatusText.Text = "None of the rows have a number in that column.";
            return;
        }

        ImportedContacts = contacts;
        UpdateExisting = UpdateExistingCheckBox.IsChecked == true;
        DialogResult = true;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void NumberColumnCombo_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (IsLoaded)
        {
            UpdateImportState();
        }
    }

    private void UpdateImportState()
    {
        var hasNumber = SelectedIndex(NumberColumnCombo) >= 0;
        ImportButton.IsEnabled = hasNumber;
        StatusText.Text = hasNumber ? "" : "Choose the column that contains the phone number.";
    }

    private static int SelectedIndex(WpfComboBox combo)
    {
        return combo.SelectedValue is int index ? index : -1;
    }

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            DialogResult = false;
        }
    }

    private sealed record ColumnOption(int Index, string Label);
}
