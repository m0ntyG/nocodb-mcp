# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-02-28

### Added
- **Table caching**: Table ID lookups are now cached per base, avoiding redundant API calls when performing multiple operations on the same table. The cache is automatically invalidated when tables are deleted or renamed.
- **`rename_table` tool**: Rename an existing table by its ID.
- **`list_columns` tool**: Standalone tool to list all columns/fields in a table (previously only available via `get_table_info`).
- **`update_column` tool**: Update properties of an existing column (title, required, unique, default value, metadata, etc.).
- **`bulk_update_records` tool**: Update multiple records in a single API call. Each record must include the primary key field.
- **`bulk_delete_records` tool**: Delete multiple records at once by providing an array of IDs.
- **`get_record_count` tool**: Get the total count of records in a table with optional filter support.
- **`delete_view` tool**: Delete an existing view from a table.
- **`updateColumn` API method** in `NocoDBClient`.
- **`renameTable` API method** in `NocoDBClient`.
- **`bulkUpdate` API method** in `NocoDBClient`.
- **`bulkDelete` API method** in `NocoDBClient`.
- **`getRecordCount` API method** in `NocoDBClient`.
- **`deleteView` API method** in `NocoDBClient`.
- **`BulkUpdateOptions` and `BulkDeleteOptions`** interfaces in `types.ts`.

### Changed
- **`deleteTable`** now clears the table cache.
- **`searchRecords`** now fetches a bounded set of records (up to 100 by default) instead of all records, improving performance.
- **`aggregate` and `groupBy`** now paginate through all records (in batches of 1000) to support large datasets correctly.
- **MCP server version** updated to `0.3.0`.

## [0.2.2] - 2025-07-07

### Fixed
- Fixed record ID truncation issue in `updateRecord` and `deleteRecord` methods
  - Removed incorrect `parseInt()` calls that were converting string IDs (e.g., "2yt-real-estate-college") to numbers
  - Both numeric and alphanumeric record IDs are now properly supported

## [0.2.1] - 2025-07-02

### Added
- New `delete_column` tool for removing columns from existing tables
- Support for deleting columns by either column ID or column name
- Comprehensive test coverage for column deletion functionality

### Fixed
- Enhanced `addColumn` method in NocoDBClient to properly extract the newly created column from the API response
- Added proper handling for the table object response from the column creation endpoint

### Changed
- Updated README with documentation and examples for the `delete_column` tool

## [0.2.0] - 2025-07-02

### Added
- New `add_column` tool for dynamically adding columns to existing tables
- Support for all major NocoDB column types including:
  - Basic types (SingleLineText, LongText, Number, Decimal, Checkbox)
  - Date/Time types (Date, DateTime, Duration)
  - Specialized types (Email, PhoneNumber, URL, Currency, Percent, Rating)
  - Selection types (SingleSelect, MultiSelect with options)
  - Advanced types (JSON, Attachment)
  - Virtual columns (QrCode, Barcode, Formula, Rollup, Lookup)
- Comprehensive column type examples in `examples/column-types-example.md`
- Enhanced documentation for column types and their parameters

### Fixed
- PhoneNumber column type identifier (was incorrectly "Phone", now "PhoneNumber")
- Boolean default values now use string format ('true'/'false') instead of integers
- Improved error handling for column operations
- SingleSelect/MultiSelect columns now properly handle options in meta field

### Changed
- Enhanced README with detailed column management documentation
- Reorganized field types documentation with categories and special parameters
- Updated tool handler to properly handle QrCode/Barcode column requirements

## [0.1.1] - Previous Release

### Initial Features
- Database operations (list bases, get base info)
- Table management (create, list, delete tables)
- Record CRUD operations
- Advanced queries and filtering
- View management
- File attachments
- Bulk operations