export default function handler(_req, res) {
  return res.status(200).json({
    ok: true,
    service: "hourking-backend",
    time: new Date().toISOString()
  });
}
