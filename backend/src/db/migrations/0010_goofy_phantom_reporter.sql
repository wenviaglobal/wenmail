ALTER TABLE "admins" ADD COLUMN "totp_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "totp_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "totp_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "totp_enabled" boolean DEFAULT false;