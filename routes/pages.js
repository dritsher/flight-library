const express = require("express");
const { adminPage } = require("../views/adminPage");
const { viewerPage } = require("../views/viewerPage");

const router = express.Router();

router.get("/flight-admin/", async (req, res) => {
  res.type("html").send(adminPage());
});

router.get("/flight-admin/viewer", async (req, res) => {
  res.type("html").send(viewerPage({
      cesiumToken: process.env.CESIUM_ION_TOKEN || ""
    })
  );
});

module.exports = router;
