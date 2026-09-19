"use client";

import type { MerchantAnalytics } from "@repo/shared";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Money } from "@repo/ui/money";

export function InventoryAnalyticsCards({ data }: { data: MerchantAnalytics }) {
  const bestSelling = data.productPerformance
    .filter((item) => item.quantitySold > 0)
    .slice(0, 5);
  const slowMoving = [...data.productPerformance]
    .sort((left, right) => {
      if (left.quantitySold !== right.quantitySold)
        return left.quantitySold - right.quantitySold;
      return BigInt(left.totalSales.minor) < BigInt(right.totalSales.minor)
        ? -1
        : BigInt(left.totalSales.minor) > BigInt(right.totalSales.minor)
          ? 1
          : 0;
    })
    .slice(0, 5);
  const unassignedItems = data.unassignedItems ?? [];
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Best-selling products</h2>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {bestSelling.length ? (
              bestSelling.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">
                    {item.name}
                    <span className="ml-2 text-xs text-slate-400">
                      {item.category}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-slate-600">
                    {item.quantitySold} units ·{" "}
                    <Money value={item.totalSales} /> ·{" "}
                    {formatChange(item.quantityChangePercent)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-slate-500">
                No product-linked sales in this period.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Slow-moving products</h2>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {slowMoving.length ? (
              slowMoving.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">{item.name}</span>
                  <span className="whitespace-nowrap text-slate-600">
                    {item.quantitySold} units ·{" "}
                    {item.turnoverStatus === "available"
                      ? `${item.turnover?.toFixed(2)} turnover`
                      : "Insufficient stock history"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No products in the catalogue.</p>
            )}
            <p className="pt-1 text-xs text-slate-500">
              Turnover is units sold divided by average recorded closing stock.
            </p>
          </CardContent>
        </Card>
      </div>
      {data.inventory ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Inventory value</h2>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span>Stock value at selling prices</span>
                <Money value={data.inventory.stockValueAtSellingPrices} />
              </div>
              <div className="flex justify-between">
                <span>Available value</span>
                <Money value={data.inventory.availableValueAtSellingPrices} />
              </div>
              <div className="flex justify-between">
                <span>Reserved value</span>
                <Money value={data.inventory.reservedValueAtSellingPrices} />
              </div>
              <div className="flex justify-between">
                <span>Low-stock products</span>
                <span>{data.inventory.lowStockProductCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Out-of-stock products</span>
                <span>{data.inventory.zeroStockProductCount}</span>
              </div>
              <p className="text-xs text-slate-500">
                Current stock snapshot. Sales filters apply to product and
                category performance.
              </p>
              <p className="text-xs text-slate-500">
                Operational estimate using current selling prices, not purchase
                cost or profit.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Category performance</h2>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {data.categoryPerformance?.length ? (
                data.categoryPerformance.slice(0, 8).map((item) => (
                  <div
                    key={item.category}
                    className="flex justify-between gap-3"
                  >
                    <span>{item.category}</span>
                    <span>
                      {item.quantitySold} units ·{" "}
                      <Money value={item.totalSales} /> ·{" "}
                      {formatChange(item.quantityChangePercent)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">
                  No category-linked performance yet.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Changes compare units with the preceding period. Historical
                sales use each product’s current category.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Unassigned items</h2>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {unassignedItems.length ? (
            unassignedItems.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">{item.name}</span>
                <span className="whitespace-nowrap text-slate-600">
                  {item.quantitySold} units · <Money value={item.totalSales} />
                </span>
              </div>
            ))
          ) : (
            <p className="text-slate-500">
              No custom sale lines in this period.
            </p>
          )}
          <p className="pt-1 text-xs text-slate-500">
            These line snapshots have no product ID, so they are not assigned to
            a catalogue SKU.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function formatChange(value: number | null) {
  return value == null
    ? "No prior baseline"
    : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
