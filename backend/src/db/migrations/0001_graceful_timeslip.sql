CREATE TABLE "platform_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"label" varchar(255),
	"group" varchar(50),
	"updated_at" timestamp with time zone DEFAULT now()
);
