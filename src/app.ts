import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import "reflect-metadata"
import routes from "./routes"

const app = express()

app.use(helmet())

const allowedOrigins = [
  process.env.FRONTEND_URL,   
  "http://localhost:3000",    
]

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error("Not allowed by CORS"))
      }
    },
    credentials: true,
  })
)

// Logging middleware
app.use(morgan("combined"))

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Static files - REMOVED uploads folder since files go directly to Cloudinary
// app.use("/uploads", express.static("uploads"))

// API routes
app.use("/api", routes)

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global error handler:", error)

  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  })
})

export default app