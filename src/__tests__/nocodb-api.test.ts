import { NocoDBClient, NocoDBError } from "../nocodb-api";
import axios from "axios";

// Mock axios
jest.mock("axios", () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      response: {
        use: jest.fn(),
      },
    },
  };
  return {
    default: {
      create: jest.fn(() => mockAxiosInstance),
      __mockInstance: mockAxiosInstance,
    },
    create: jest.fn(() => mockAxiosInstance),
    __mockInstance: mockAxiosInstance,
  };
});

function getAxiosMock() {
  return (axios as any).__mockInstance;
}

function makeClient() {
  return new NocoDBClient({
    baseUrl: "http://localhost:8080",
    apiToken: "test-token",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-setup interceptor mock after clearAllMocks
  getAxiosMock().interceptors = { response: { use: jest.fn() } };
});

describe("NocoDBError", () => {
  it("should have correct name and message", () => {
    const err = new NocoDBError("test error", 404, { detail: "x" });
    expect(err.name).toBe("NocoDBError");
    expect(err.message).toBe("test error");
    expect(err.statusCode).toBe(404);
    expect(err.details).toEqual({ detail: "x" });
  });
});

describe("NocoDBClient - listBases", () => {
  it("returns list of bases", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: { list: [{ id: "b1", title: "Base 1", status: "active" }] },
    });
    const bases = await client.listBases();
    expect(bases).toHaveLength(1);
    expect(bases[0].id).toBe("b1");
    expect(getAxiosMock().get).toHaveBeenCalledWith(
      "/api/v1/db/meta/projects",
    );
  });
});

describe("NocoDBClient - listTables", () => {
  it("returns list of tables for a base", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: {
        list: [{ id: "t1", table_name: "customers", title: "Customers" }],
      },
    });
    const tables = await client.listTables("base1");
    expect(tables).toHaveLength(1);
    expect(tables[0].id).toBe("t1");
  });
});

describe("NocoDBClient - table ID caching", () => {
  it("resolves table ID from cache on second call", async () => {
    const client = makeClient();
    // First call: listTables to populate cache
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: {
          list: [{ id: "t1", table_name: "customers", title: "Customers" }],
        },
      })
      // Second call: get record (should use cached table ID, no extra listTables call)
      .mockResolvedValueOnce({ data: { Id: 1, Name: "Acme" } });

    await client.getRecord("base1", "customers", "1");
    // Second call should use cache, not call listTables again
    getAxiosMock().get.mockResolvedValueOnce({ data: { Id: 1, Name: "Acme" } });
    await client.getRecord("base1", "customers", "1");

    // listTables should only be called once (first resolution, then cached)
    const getCalls = getAxiosMock().get.mock.calls;
    const tableListCalls = getCalls.filter((call: string[]) =>
      call[0].includes("projects/base1/tables"),
    );
    expect(tableListCalls).toHaveLength(1);
  });
});

describe("NocoDBClient - createRecord", () => {
  it("creates a record in the correct table", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: { list: [{ id: "t1", table_name: "customers", title: "Customers" }] },
    });
    getAxiosMock().post.mockResolvedValueOnce({
      data: { Id: 1, Name: "Acme" },
    });

    const record = await client.createRecord("base1", "customers", {
      Name: "Acme",
    });
    expect(record.Id).toBe(1);
    expect(getAxiosMock().post).toHaveBeenCalledWith(
      "/api/v2/tables/t1/records",
      { Name: "Acme" },
    );
  });

  it("throws NocoDBError when table not found", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({ data: { list: [] } });
    await expect(
      client.createRecord("base1", "nonexistent", { Name: "X" }),
    ).rejects.toThrow("Table nonexistent not found");
  });
});

describe("NocoDBClient - bulkInsert", () => {
  it("bulk inserts records", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: { list: [{ id: "t1", table_name: "items", title: "Items" }] },
    });
    getAxiosMock().post.mockResolvedValueOnce({
      data: [{ Id: 1 }, { Id: 2 }],
    });

    const result = await client.bulkInsert("base1", "items", {
      records: [{ Name: "A" }, { Name: "B" }],
    });
    expect(result).toHaveLength(2);
    expect(getAxiosMock().post).toHaveBeenCalledWith(
      "/api/v2/tables/t1/records",
      [{ Name: "A" }, { Name: "B" }],
    );
  });
});

describe("NocoDBClient - bulkUpdate", () => {
  it("bulk updates records", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: { list: [{ id: "t1", table_name: "items", title: "Items" }] },
    });
    getAxiosMock().patch.mockResolvedValueOnce({
      data: [{ Id: 1, Name: "Updated A" }],
    });

    const result = await client.bulkUpdate("base1", "items", [
      { Id: 1, Name: "Updated A" },
    ]);
    expect(result).toHaveLength(1);
    expect(getAxiosMock().patch).toHaveBeenCalledWith(
      "/api/v2/tables/t1/records",
      [{ Id: 1, Name: "Updated A" }],
    );
  });
});

describe("NocoDBClient - bulkDelete", () => {
  it("bulk deletes records by ID", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: { list: [{ id: "t1", table_name: "items", title: "Items" }] },
    });
    getAxiosMock().delete.mockResolvedValueOnce({ data: {} });

    await client.bulkDelete("base1", "items", [1, 2, 3]);
    expect(getAxiosMock().delete).toHaveBeenCalledWith(
      "/api/v2/tables/t1/records",
      { data: [{ Id: 1 }, { Id: 2 }, { Id: 3 }] },
    );
  });
});

describe("NocoDBClient - listRecords", () => {
  it("returns records with pagination info", async () => {
    const client = makeClient();
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: { list: [{ id: "t1", table_name: "t", title: "T" }] },
      })
      .mockResolvedValueOnce({
        data: {
          list: [{ Id: 1 }, { Id: 2 }],
          pageInfo: { totalRows: 2, page: 1, pageSize: 25 },
        },
      });
    const result = await client.listRecords("base1", "t", { limit: 25 });
    expect(result.list).toHaveLength(2);
    expect(result.pageInfo.totalRows).toBe(2);
  });

  it("passes query params correctly", async () => {
    const client = makeClient();
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: { list: [{ id: "t1", table_name: "t", title: "T" }] },
      })
      .mockResolvedValueOnce({
        data: { list: [], pageInfo: {} },
      });
    await client.listRecords("base1", "t", {
      where: "(Name,eq,test)",
      sort: "-Name",
      fields: ["Name", "Email"],
      limit: 10,
      offset: 5,
    });
    const callUrl = getAxiosMock().get.mock.calls[1][0];
    expect(callUrl).toContain("where=%28Name%2Ceq%2Ctest%29");
    expect(callUrl).toContain("sort=-Name");
    expect(callUrl).toContain("fields=Name%2CEmail");
    expect(callUrl).toContain("limit=10");
    expect(callUrl).toContain("offset=5");
  });
});

describe("NocoDBClient - searchRecords", () => {
  it("filters records client-side based on query", async () => {
    const client = makeClient();
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: { list: [{ id: "t1", table_name: "t", title: "T" }] },
      })
      .mockResolvedValueOnce({
        data: {
          list: [
            { Id: 1, Name: "John Doe" },
            { Id: 2, Name: "Jane Smith" },
            { Id: 3, Name: "Bob" },
          ],
          pageInfo: {},
        },
      });
    const result = await client.searchRecords("base1", "t", "John");
    expect(result.list).toHaveLength(1);
    expect(result.list[0].Name).toBe("John Doe");
  });
});

describe("NocoDBClient - aggregate", () => {
  it("counts records", async () => {
    const client = makeClient();
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: { list: [{ id: "t1", table_name: "t", title: "T" }] },
      })
      .mockResolvedValueOnce({
        data: { list: [{ Id: 1 }, { Id: 2 }, { Id: 3 }], pageInfo: {} },
      });
    const count = await client.aggregate("base1", "t", {
      column_name: "Id",
      func: "count",
    });
    expect(count).toBe(3);
  });

  it("sums a numeric column", async () => {
    const client = makeClient();
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: { list: [{ id: "t1", table_name: "t", title: "T" }] },
      })
      .mockResolvedValueOnce({
        data: {
          list: [{ Amount: 10 }, { Amount: 20 }, { Amount: 30 }],
          pageInfo: {},
        },
      });
    const sum = await client.aggregate("base1", "t", {
      column_name: "Amount",
      func: "sum",
    });
    expect(sum).toBe(60);
  });

  it("throws for unknown function", async () => {
    const client = makeClient();
    getAxiosMock().get
      .mockResolvedValueOnce({
        data: { list: [{ id: "t1", table_name: "t", title: "T" }] },
      })
      .mockResolvedValueOnce({
        data: { list: [], pageInfo: {} },
      });
    await expect(
      client.aggregate("base1", "t", {
        column_name: "x",
        func: "median" as any,
      }),
    ).rejects.toThrow("Unknown aggregate function: median");
  });
});

describe("NocoDBClient - listViews", () => {
  it("returns views for a table", async () => {
    const client = makeClient();
    getAxiosMock().get.mockResolvedValueOnce({
      data: {
        list: [{ id: "v1", title: "Grid View", type: 1, fk_model_id: "t1" }],
      },
    });
    const views = await client.listViews("t1");
    expect(views).toHaveLength(1);
    expect(views[0].title).toBe("Grid View");
  });
});
