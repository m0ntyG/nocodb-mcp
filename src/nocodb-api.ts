import axios, { AxiosInstance, AxiosError } from "axios";
import FormData from "form-data";
import * as fs from "fs";
import * as path from "path";
import {
  NocoDBConfig,
  NocoDBBase,
  NocoDBTable,
  NocoDBColumn,
  NocoDBRecord,
  NocoDBView,
  QueryOptions,
  AggregateOptions,
  BulkInsertOptions,
  BulkUpdateOptions,
  BulkDeleteOptions,
} from "./types.js";

export class NocoDBError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: any,
  ) {
    super(message);
    this.name = "NocoDBError";
  }
}

// Number of records to fetch per page when paginating through all records
const PAGINATION_PAGE_SIZE = 1000;
// Multiplier for over-fetching in search to allow client-side filtering
const SEARCH_OVERFETCH_MULTIPLIER = 4;

export class NocoDBClient {
  private client: AxiosInstance;
  private config: NocoDBConfig;
  private tableCache: Map<string, NocoDBTable[]> = new Map();

  constructor(config: NocoDBConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiToken && { "xc-token": config.apiToken }),
        ...(config.authToken && { "xc-auth": config.authToken }),
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const data = error.response?.data as any;
        const message = data?.msg || data?.message || error.message;
        throw new NocoDBError(
          message,
          error.response?.status,
          error.response?.data,
        );
      },
    );
  }

  // Base/Project operations
  async listBases(): Promise<NocoDBBase[]> {
    const response = await this.client.get("/api/v1/db/meta/projects");
    return response.data.list;
  }

  async getBase(baseId: string): Promise<NocoDBBase> {
    const response = await this.client.get(
      `/api/v1/db/meta/projects/${baseId}`,
    );
    return response.data;
  }

  // Table operations
  async listTables(baseId: string): Promise<NocoDBTable[]> {
    const response = await this.client.get(
      `/api/v1/db/meta/projects/${baseId}/tables`,
    );
    const tables = response.data.list;
    // Update cache
    this.tableCache.set(baseId, tables);
    return tables;
  }

  // Helper: resolve table name to table object (uses cache)
  private async resolveTable(baseId: string, tableName: string): Promise<NocoDBTable> {
    let tables = this.tableCache.get(baseId);
    if (!tables) {
      tables = await this.listTables(baseId);
    }
    const table = tables.find(
      (t) => t.table_name === tableName || t.title === tableName,
    );
    if (!table) {
      // Refresh cache and retry once
      tables = await this.listTables(baseId);
      const retried = tables.find(
        (t) => t.table_name === tableName || t.title === tableName,
      );
      if (!retried) {
        throw new NocoDBError(`Table ${tableName} not found`);
      }
      return retried;
    }
    return table;
  }

  async getTable(tableId: string): Promise<NocoDBTable> {
    const response = await this.client.get(`/api/v1/db/meta/tables/${tableId}`);
    return response.data;
  }

  async createTable(
    baseId: string,
    tableName: string,
    columns: any[],
  ): Promise<NocoDBTable> {
    const response = await this.client.post(
      `/api/v1/db/meta/projects/${baseId}/tables`,
      {
        table_name: tableName,
        title: tableName,
        columns: columns,
      },
    );
    return response.data;
  }

  async deleteTable(tableId: string): Promise<void> {
    await this.client.delete(`/api/v1/db/meta/tables/${tableId}`);
    // Invalidate cache for all bases since we don't know which base this table belongs to
    this.tableCache.clear();
  }

  async renameTable(tableId: string, title: string): Promise<NocoDBTable> {
    const response = await this.client.patch(
      `/api/v1/db/meta/tables/${tableId}`,
      { title },
    );
    // Invalidate cache
    this.tableCache.clear();
    return response.data;
  }

  // Column operations
  async listColumns(tableId: string): Promise<NocoDBColumn[]> {
    // Get columns from table info since dedicated columns endpoint doesn't exist
    const response = await this.client.get(`/api/v1/db/meta/tables/${tableId}`);
    return response.data.columns || [];
  }

  async addColumn(
    tableId: string,
    columnDefinition: any,
  ): Promise<NocoDBColumn> {
    const response = await this.client.post(
      `/api/v2/meta/tables/${tableId}/columns`,
      columnDefinition,
    );
    // The API returns the whole table object with columns,
    // so we need to find the newly added column
    const tableData = response.data;
    if (tableData.columns) {
      // Find the column that matches our title or column_name
      const newColumn = tableData.columns.find(
        (col: any) =>
          col.title === columnDefinition.title ||
          col.column_name === columnDefinition.column_name,
      );
      if (newColumn) {
        return newColumn;
      }
    }
    // Fallback to returning the whole response if we can't find the column
    return response.data;
  }

  async deleteColumn(columnId: string): Promise<void> {
    await this.client.delete(`/api/v2/meta/columns/${columnId}`);
  }

  async updateColumn(
    columnId: string,
    columnDefinition: any,
  ): Promise<NocoDBColumn> {
    const response = await this.client.patch(
      `/api/v2/meta/columns/${columnId}`,
      columnDefinition,
    );
    return response.data;
  }

  // Record operations
  async createRecord(
    baseId: string,
    tableName: string,
    data: NocoDBRecord,
  ): Promise<NocoDBRecord> {
    const table = await this.resolveTable(baseId, tableName);
    const response = await this.client.post(
      `/api/v2/tables/${table.id}/records`,
      data,
    );
    return response.data;
  }

  async bulkInsert(
    baseId: string,
    tableName: string,
    options: BulkInsertOptions,
  ): Promise<NocoDBRecord[]> {
    const table = await this.resolveTable(baseId, tableName);
    const response = await this.client.post(
      `/api/v2/tables/${table.id}/records`,
      options.records,
    );
    return response.data;
  }

  async getRecord(
    baseId: string,
    tableName: string,
    recordId: string,
  ): Promise<NocoDBRecord> {
    const table = await this.resolveTable(baseId, tableName);
    const response = await this.client.get(
      `/api/v2/tables/${table.id}/records/${recordId}`,
    );
    return response.data;
  }

  async listRecords(
    baseId: string,
    tableName: string,
    options?: QueryOptions,
  ): Promise<{ list: NocoDBRecord[]; pageInfo: any }> {
    const table = await this.resolveTable(baseId, tableName);

    const params = new URLSearchParams();

    if (options?.where) params.append("where", options.where);
    if (options?.sort) {
      const sortStr = Array.isArray(options.sort)
        ? options.sort.join(",")
        : options.sort;
      params.append("sort", sortStr);
    }
    if (options?.fields) {
      const fieldsStr = Array.isArray(options.fields)
        ? options.fields.join(",")
        : options.fields;
      params.append("fields", fieldsStr);
    }
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.offset) params.append("offset", options.offset.toString());
    if (options?.viewId) params.append("viewId", options.viewId);

    const response = await this.client.get(
      `/api/v2/tables/${table.id}/records?${params.toString()}`,
    );
    return response.data;
  }

  async updateRecord(
    baseId: string,
    tableName: string,
    recordId: string,
    data: NocoDBRecord,
  ): Promise<NocoDBRecord> {
    const table = await this.resolveTable(baseId, tableName);

    // Get the primary key field name (usually ID but can vary)
    const columns = await this.listColumns(table.id);
    const pkColumn =
      columns.find((col) => col.pk) ||
      columns.find((col) => col.title === "ID");
    const pkField = pkColumn?.title || "ID";

    const response = await this.client.patch(
      `/api/v2/tables/${table.id}/records`,
      {
        [pkField]: recordId,
        ...data,
      },
    );
    return response.data;
  }

  async deleteRecord(
    baseId: string,
    tableName: string,
    recordId: string,
  ): Promise<void> {
    const table = await this.resolveTable(baseId, tableName);

    // Get the primary key field name (usually ID but can vary)
    const columns = await this.listColumns(table.id);
    const pkColumn =
      columns.find((col) => col.pk) ||
      columns.find((col) => col.title === "ID");
    const pkField = pkColumn?.title || "ID";

    await this.client.delete(`/api/v2/tables/${table.id}/records`, {
      data: { [pkField]: recordId },
    });
  }

  async bulkUpdate(
    baseId: string,
    tableName: string,
    options: BulkUpdateOptions,
  ): Promise<NocoDBRecord[]> {
    const table = await this.resolveTable(baseId, tableName);
    const response = await this.client.patch(
      `/api/v2/tables/${table.id}/records`,
      options.records,
    );
    return response.data;
  }

  async bulkDelete(
    baseId: string,
    tableName: string,
    options: BulkDeleteOptions,
  ): Promise<void> {
    const table = await this.resolveTable(baseId, tableName);
    // NocoDB bulk delete expects array of objects with the PK field
    const columns = await this.listColumns(table.id);
    const pkColumn =
      columns.find((col) => col.pk) ||
      columns.find((col) => col.title === "ID");
    const pkField = pkColumn?.title || "ID";

    const deletePayload = options.ids.map((id) => ({ [pkField]: id }));
    await this.client.delete(`/api/v2/tables/${table.id}/records`, {
      data: deletePayload,
    });
  }

  async getRecordCount(
    baseId: string,
    tableName: string,
    where?: string,
  ): Promise<number> {
    const table = await this.resolveTable(baseId, tableName);
    const params = new URLSearchParams();
    if (where) params.append("where", where);
    const response = await this.client.get(
      `/api/v2/tables/${table.id}/records/count?${params.toString()}`,
    );
    return response.data.count ?? response.data;
  }

  // View operations
  async listViews(tableId: string): Promise<NocoDBView[]> {
    const response = await this.client.get(
      `/api/v2/meta/tables/${tableId}/views`,
    );
    return response.data.list || [];
  }

  async createView(
    tableId: string,
    title: string,
    type: number = 1,
  ): Promise<NocoDBView> {
    const response = await this.client.post(
      `/api/v2/meta/tables/${tableId}/views`,
      {
        title,
        type,
      },
    );
    return response.data;
  }

  async deleteView(viewId: string): Promise<void> {
    await this.client.delete(`/api/v2/meta/views/${viewId}`);
  }

  // Search operation
  async searchRecords(
    baseId: string,
    tableName: string,
    query: string,
    options?: QueryOptions,
  ): Promise<{ list: NocoDBRecord[]; pageInfo: any }> {
    // Use regular list with client-side filtering
    // Fetch a reasonable batch to search through
    const fetchOptions = {
      ...options,
      limit: options?.limit ? options.limit * SEARCH_OVERFETCH_MULTIPLIER : 100,
    };
    const records = await this.listRecords(baseId, tableName, fetchOptions);
    const filtered = records.list.filter((record) => {
      return Object.values(record).some((value) =>
        String(value).toLowerCase().includes(query.toLowerCase()),
      );
    });
    // Apply limit to filtered results
    const limited = options?.limit
      ? filtered.slice(options.offset || 0, (options.offset || 0) + options.limit)
      : filtered;
    return { list: limited, pageInfo: records.pageInfo };
  }

  // Aggregate operations
  async aggregate(
    baseId: string,
    tableName: string,
    options: AggregateOptions,
  ): Promise<number> {
    // Client-side aggregation - fetch all records matching the filter
    const limit = PAGINATION_PAGE_SIZE;
    let offset = 0;
    let allRecords: NocoDBRecord[] = [];
    let hasMore = true;

    while (hasMore) {
      const page = await this.listRecords(baseId, tableName, {
        where: options.where,
        limit,
        offset,
      });
      allRecords = allRecords.concat(page.list);
      hasMore = page.list.length === limit;
      offset += limit;
    }

    if (options.func === "count") {
      return allRecords.length;
    }

    const values = allRecords.map((r) => Number(r[options.column_name]) || 0);

    switch (options.func) {
      case "sum":
        return values.reduce((a, b) => a + b, 0);
      case "avg":
        return values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
      case "min":
        return values.length > 0 ? Math.min(...values) : 0;
      case "max":
        return values.length > 0 ? Math.max(...values) : 0;
      default:
        throw new NocoDBError(`Unknown aggregate function: ${options.func}`);
    }
  }

  // Group by operation
  async groupBy(
    baseId: string,
    tableName: string,
    columnName: string,
    options?: QueryOptions,
  ): Promise<any[]> {
    // Client-side grouping - fetch all matching records
    const limit = PAGINATION_PAGE_SIZE;
    let offset = 0;
    let allRecords: NocoDBRecord[] = [];
    let hasMore = true;

    while (hasMore) {
      const page = await this.listRecords(baseId, tableName, {
        where: options?.where,
        limit,
        offset,
      });
      allRecords = allRecords.concat(page.list);
      hasMore = page.list.length === limit;
      offset += limit;
    }

    const groups = new Map<any, number>();
    allRecords.forEach((record) => {
      const value = record[columnName];
      groups.set(value, (groups.get(value) || 0) + 1);
    });

    const result = Array.from(groups.entries()).map(([value, count]) => ({
      [columnName]: value,
      count,
    }));

    // Apply sorting if specified
    if (options?.sort) {
      const sortField = Array.isArray(options.sort)
        ? options.sort[0]
        : options.sort;
      const desc = sortField.startsWith("-");
      result.sort((a, b) => {
        const aVal = a[columnName];
        const bVal = b[columnName];
        return desc ? (bVal > aVal ? 1 : -1) : aVal > bVal ? 1 : -1;
      });
    }

    // Apply limit and offset
    const start = options?.offset || 0;
    const end = options?.limit ? start + options.limit : undefined;

    return result.slice(start, end);
  }

  // File upload operations
  async uploadFile(filePath: string, storagePath?: string): Promise<any> {
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    formData.append("file", fileStream, fileName);
    if (storagePath) {
      formData.append("path", storagePath);
    }

    const response = await this.client.post(
      "/api/v2/storage/upload",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      },
    );
    return response.data;
  }

  async uploadByUrl(urls: string[], storagePath?: string): Promise<any> {
    const urlData = urls.map((url) => ({ url }));
    const data = storagePath ? { urls: urlData, path: storagePath } : urlData;

    const response = await this.client.post(
      "/api/v2/storage/upload-by-url",
      data,
    );
    return response.data;
  }
}

