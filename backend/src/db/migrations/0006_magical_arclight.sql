CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"action_url" varchar(255),
	"action_label" varchar(50),
	"severity" varchar(20) DEFAULT 'info',
	"read" boolean DEFAULT false,
	"dismissed" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
