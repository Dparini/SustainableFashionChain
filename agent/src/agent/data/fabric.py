import json
import urllib.request
from pathlib import Path


class FabricReader:
    """Authenticated read-only API or explicitly labelled local fixture."""
    def __init__(self, config):
        self.config = config

    def read(self):
        if self.config.get("fabric_fixture"):
            data = json.loads(Path(self.config["fabric_fixture"]).read_text())
            return data, False
        url = self.config["fabric_api_url"].rstrip("/")
        # Token is restricted to read-only access; it is never passed to agents.
        import os
        token = os.environ.get("SFC_FABRIC_READ_TOKEN")
        if not token:
            raise ValueError("FABRIC_READ_TOKEN_REQUIRED")
        batches = []
        from urllib.parse import quote
        for batch_id in self.config["fabric_batch_ids"]:
            req = urllib.request.Request(url + "/batches/" + quote(batch_id, safe=""),
                                         headers={"Authorization": "Bearer " + token})
            with urllib.request.urlopen(req, timeout=10) as response:
                batches.append(json.load(response))
        return {"batches": batches, "delayed_shipments": 0, "rejected_batches": 0,
                "supplier_name": "Fabric-certified batches"}, True
