# n8n-nodes-email-parser

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Compatibility](#compatibility)  
[Resources](#resources)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

This package provides one node:

- `Email Parser` parses raw RFC 822 email messages with `mailparser`.

Supported workflows:

- Parse a raw email stored in a JSON field.
- Parse a raw email stored in a binary property.
- Return normalized metadata such as subject, sender, recipients, dates, headers, text, and HTML.
- Optionally expose attachments as n8n binary output properties.
- Optionally include attachment content as base64 in JSON.

### Input modes

- `JSON`: read the raw message from a JSON field.
- `Binary`: read the raw message from a binary property.

For JSON input, the node supports:

- Plain UTF-8 email source
- Base64 encoded email source
- Auto-detection between UTF-8 and base64

### Output

The parsed result is written to a configurable JSON property. By default this is `parsedEmail`.

The node returns:

- Core headers and addressing information
- Text and HTML bodies
- Normalized header map
- Attachment metadata
- Optional attachment binaries

## Compatibility

Tested with:

- n8n community node packaging layout

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [mailparser package](https://www.npmjs.com/package/mailparser)

## Local development

```bash
./testdata/run.sh
```

The script performs dependency installation and TypeScript build inside Docker, prepares a clean custom package under `.testdata/custom`, and starts `n8nio/n8n`.
