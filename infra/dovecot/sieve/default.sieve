require ["fileinto", "mailbox"];

# Move spam-flagged emails to Junk folder
if header :contains "X-Spam-Status" "Yes" {
  fileinto :create "Junk";
  stop;
}

# Also check Rspamd's X-Spam header
if header :contains "X-Spam" "Yes" {
  fileinto :create "Junk";
  stop;
}
