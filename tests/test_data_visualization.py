import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.routes import data_visualization as viz


def bars(previous, current, volume=100, date="2026-10-23"):
    return [
        {"date": "2026-10-22", "c": previous, "v": 50},
        {"date": date, "c": current, "v": volume},
    ]


class DataVisualizationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        viz._cache.clear()

    def tearDown(self):
        viz._cache.clear()

    async def test_volume_cloud_keeps_valid_quotes_when_one_ticker_fails(self):
        sample = [(("AAPL", "Apple"), bars(100, 110)), (("MSFT", "Microsoft"), None)]
        with patch.object(viz, "_fetch_sample", new=AsyncMock(return_value=sample)):
            result = await viz.market_volume_cloud("us")
        self.assertEqual(result["items"][0]["status"], "ok")
        self.assertEqual(result["items"][0]["change_pct"], 10.0)
        self.assertEqual(result["items"][0]["volume_ratio"], 2.0)
        self.assertEqual(result["items"][1]["status"], "error")

    async def test_sector_cloud_aggregates_trade_value_and_weighted_change(self):
        sample = [
            (("AAA.KS", "A", "반도체"), bars(100, 110, 100)),
            (("BBB.KS", "B", "반도체"), bars(200, 180, 50)),
            (("CCC.KS", "C", "바이오"), None),
        ]
        with patch.object(viz, "_fetch_sample", new=AsyncMock(return_value=sample)):
            result = await viz.market_sector_cloud("kospi")
        self.assertEqual(len(result["sectors"]), 1)
        sector = result["sectors"][0]
        self.assertEqual(sector["trade_value"], 20_000)
        self.assertEqual(sector["stock_count"], 2)
        self.assertEqual(sector["change_pct"], 1.0)
        self.assertEqual(sector["leader_name"], "A")

    async def test_upstream_failure_is_reported_instead_of_an_empty_chart(self):
        with patch.object(viz, "_fetch_sample", new=AsyncMock(return_value=[])):
            with self.assertRaises(HTTPException) as caught:
                await viz.market_sector_cloud("kosdaq")
        self.assertEqual(caught.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
