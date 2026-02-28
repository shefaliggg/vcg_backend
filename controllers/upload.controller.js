const fs = require("fs");
const path = require("path");

const uploadSignatureBase64 = async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ message: "No image provided" });
    }

    // Remove base64 prefix
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const uploadsDir = path.join(__dirname, "../uploads/signatures");

    // Ensure folder exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `signature-${Date.now()}.png`;
    const filePath = path.join(uploadsDir, fileName);

    fs.writeFileSync(filePath, base64Data, "base64");

    return res.json({
      fileUrl: `/uploads/signatures/${fileName}`,
    });

  } catch (error) {
    console.error("Upload signature error:", error);
    return res.status(500).json({
      message: "Failed to upload signature",
      error: error.message,
    });
  }
};

module.exports = {
  uploadSignatureBase64,
};