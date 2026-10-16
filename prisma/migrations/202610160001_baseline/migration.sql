-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "originalPhone" TEXT,
    "address" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "mapsUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "leadType" TEXT NOT NULL DEFAULT 'NO_WEBSITE',
    "websiteUrl" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "openingHours" TEXT,
    "services" TEXT,
    "photos" TEXT,
    "topReviews" TEXT,
    "socialLinks" TEXT,
    "demoUrl" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_placeId_key" ON "Lead"("placeId");
