interface DnsGuideProps {
  domainName: string;
  platformDomain: string;
  verificationToken: string;
  dkimSelector: string;
  dkimPublicKey: string;
}

export function DnsGuide({
  domainName,
  platformDomain,
  verificationToken,
  dkimSelector,
  dkimPublicKey,
}: DnsGuideProps) {
  const records = [
    {
      step: 1,
      type: "TXT",
      host: domainName,
      value: `mailplatform-verify=${verificationToken}`,
      purpose: "Verify domain ownership",
    },
    {
      step: 2,
      type: "MX",
      host: domainName,
      value: `10 ${platformDomain}`,
      purpose: "Route incoming email to our server",
    },
    {
      step: 3,
      type: "TXT",
      host: domainName,
      value: `v=spf1 include:${platformDomain} ~all`,
      purpose: "Authorize our server to send email for this domain",
    },
    {
      step: 4,
      type: "TXT",
      host: `${dkimSelector}._domainkey.${domainName}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
      purpose: "DKIM signature verification",
    },
    {
      step: 5,
      type: "TXT",
      host: `_dmarc.${domainName}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${platformDomain}`,
      purpose: "DMARC policy for email authentication",
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">DNS Setup Guide for {domainName}</h3>
      <p className="text-sm text-gray-500">
        Add these DNS records at your domain registrar. DNS changes may take up to 48 hours to propagate.
      </p>

      {records.map((rec) => (
        <div key={rec.step} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
              {rec.step}
            </span>
            <span className="font-medium text-sm">{rec.purpose}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Type:</span>{" "}
              <code className="bg-white px-1 rounded">{rec.type}</code>
            </div>
            <div>
              <span className="text-gray-500">Host:</span>{" "}
              <code className="bg-white px-1 rounded text-xs">{rec.host}</code>
            </div>
            <div className="col-span-3">
              <span className="text-gray-500">Value:</span>
              <code className="block bg-white px-2 py-1 rounded text-xs mt-1 break-all">
                {rec.value}
              </code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
