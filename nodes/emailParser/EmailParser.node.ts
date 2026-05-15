import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { AddressObject, Attachment, ParsedMail, simpleParser } from 'mailparser';

type HeaderValue = string | string[];

function decodeJsonEmail(rawValue: string, encoding: 'auto' | 'base64' | 'utf8'): Buffer {
	if (encoding === 'base64') {
		return Buffer.from(rawValue, 'base64');
	}

	if (encoding === 'utf8') {
		return Buffer.from(rawValue, 'utf8');
	}

	const compact = rawValue.replace(/\s+/g, '');
	const looksLikeBase64 = compact.length > 0 && compact.length % 4 !== 1 && /^[A-Za-z0-9+/=]+$/.test(compact);

	if (!looksLikeBase64) {
		return Buffer.from(rawValue, 'utf8');
	}

	const decoded = Buffer.from(compact, 'base64');
	const decodedText = decoded.toString('utf8', 0, Math.min(decoded.length, 512));
	const resemblesEmail =
		/[A-Za-z-]+:\s/.test(decodedText) && (decodedText.includes('\n') || decodedText.includes('\r'));

	return resemblesEmail ? decoded : Buffer.from(rawValue, 'utf8');
}

function addressObjectToJson(address?: AddressObject): Array<{ name: string; address: string }> {
	if (address?.value == null) {
		return [];
	}

	return address.value.map((entry: { name?: string; address?: string }) => ({
		name: entry.name ?? '',
		address: entry.address ?? '',
	}));
}

function headersToJson(parsed: ParsedMail): Record<string, HeaderValue> {
	const normalized: Record<string, HeaderValue> = {};

	for (const [key, value] of parsed.headers.entries()) {
		if (typeof value === 'string') {
			normalized[key] = value;
			continue;
		}

		if (Array.isArray(value)) {
			normalized[key] = value.map((entry) => String(entry));
			continue;
		}

		if (value instanceof Date) {
			normalized[key] = value.toISOString();
			continue;
		}

		if (value != null && typeof value === 'object' && 'value' in value) {
			normalized[key] = JSON.stringify(value);
			continue;
		}

		normalized[key] = String(value);
	}

	return normalized;
}

function attachmentMetadata(
	attachment: Attachment,
	index: number,
	includeContent: boolean,
	binaryPropertyName?: string,
) {
	return {
		index,
		filename: attachment.filename ?? `attachment-${index + 1}`,
		contentType: attachment.contentType,
		contentDisposition: attachment.contentDisposition,
		contentId: attachment.cid ?? '',
		checksum: attachment.checksum,
		size: attachment.size,
		related: attachment.related ?? false,
		headers: Object.fromEntries(
			Array.from(attachment.headers.entries() as IterableIterator<[string, unknown]>).map(
				([key, value]) => [key, String(value)],
			),
		),
		binaryPropertyName,
		content: includeContent ? attachment.content.toString('base64') : undefined,
	};
}

const sourceProperties: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		options: [
			{
				name: 'Binary',
				value: 'binary',
			},
			{
				name: 'JSON',
				value: 'json',
			},
		],
		default: 'binary',
		description: 'Where the raw email message should be read from',
	},
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: {
				source: ['binary'],
			},
		},
		description: 'Binary property that contains the raw email',
	},
	{
		displayName: 'JSON Property',
		name: 'jsonPropertyName',
		type: 'string',
		default: 'rawEmail',
		displayOptions: {
			show: {
				source: ['json'],
			},
		},
		description: 'JSON property that contains the raw email',
	},
	{
		displayName: 'JSON Encoding',
		name: 'jsonEncoding',
		type: 'options',
		options: [
			{
				name: 'Auto Detect',
				value: 'auto',
			},
			{
				name: 'Base64',
				value: 'base64',
			},
			{
				name: 'UTF-8',
				value: 'utf8',
			},
		],
		default: 'auto',
		displayOptions: {
			show: {
				source: ['json'],
			},
		},
		description: 'Encoding used by the JSON property value',
	},
	{
		displayName: 'Output Property',
		name: 'outputPropertyName',
		type: 'string',
		default: 'parsedEmail',
		description: 'JSON property name that will receive the parsed email data',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [
			{
				displayName: 'Expose Attachments As Binary',
				name: 'exposeAttachmentsAsBinary',
				type: 'boolean',
				default: true,
				description: 'Whether attachments should be added as binary output properties',
			},
			{
				displayName: 'Binary Property Prefix',
				name: 'binaryPropertyPrefix',
				type: 'string',
				default: 'attachment_',
				description: 'Prefix used for generated binary attachment property names',
			},
			{
				displayName: 'Include Attachment Content In JSON',
				name: 'includeAttachmentContent',
				type: 'boolean',
				default: false,
				description: 'Whether attachment content should also be returned as base64 in JSON',
			},
			{
				displayName: 'Include Headers',
				name: 'includeHeaders',
				type: 'boolean',
				default: true,
				description: 'Whether normalized headers should be included in the parsed output',
			},
		],
	},
];

export class EmailParser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Email Parser',
		name: 'emailParser',
		icon: 'file:emailParser.svg',
		group: ['transform'],
		version: 1,
		description: 'Parse raw email messages with mailparser',
		defaults: {
			name: 'Email Parser',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: sourceProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const item = items[itemIndex];
				const source = this.getNodeParameter('source', itemIndex) as 'binary' | 'json';
				const outputPropertyName = this.getNodeParameter('outputPropertyName', itemIndex) as string;
				const options = this.getNodeParameter('options', itemIndex, {}) as {
					exposeAttachmentsAsBinary?: boolean;
					binaryPropertyPrefix?: string;
					includeAttachmentContent?: boolean;
					includeHeaders?: boolean;
				};
				const exposeAttachmentsAsBinary = options.exposeAttachmentsAsBinary ?? true;
				const binaryPropertyPrefix = options.binaryPropertyPrefix ?? 'attachment_';
				const includeAttachmentContent = options.includeAttachmentContent ?? false;
				const includeHeaders = options.includeHeaders ?? true;

				let rawEmailBuffer: Buffer;

				if (source === 'binary') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
					const binaryItem = item.binary?.[binaryPropertyName];

					if (binaryItem == null) {
						throw new NodeOperationError(
							this.getNode(),
							`Binary property "${binaryPropertyName}" was not found.`,
							{ itemIndex },
						);
					}

					const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
					rawEmailBuffer = Buffer.from(buffer);
				} else {
					const jsonPropertyName = this.getNodeParameter('jsonPropertyName', itemIndex) as string;
					const jsonEncoding = this.getNodeParameter('jsonEncoding', itemIndex) as
						| 'auto'
						| 'base64'
						| 'utf8';
					const rawValue = item.json[jsonPropertyName];

					if (typeof rawValue !== 'string' || rawValue === '') {
						throw new NodeOperationError(
							this.getNode(),
							`JSON property "${jsonPropertyName}" must contain a non-empty string.`,
							{ itemIndex },
						);
					}

					rawEmailBuffer = decodeJsonEmail(rawValue, jsonEncoding);
				}

				const parsed = await simpleParser(rawEmailBuffer);
				const outputJson = { ...item.json };
				const outputBinary = { ...(item.binary ?? {}) };
				const attachments = [];

				for (const [attachmentIndex, attachment] of parsed.attachments.entries()) {
					let binaryPropertyName: string | undefined;

					if (exposeAttachmentsAsBinary) {
						binaryPropertyName = `${binaryPropertyPrefix}${attachmentIndex}`;
						outputBinary[binaryPropertyName] = await this.helpers.prepareBinaryData(
							attachment.content,
							attachment.filename ?? `attachment-${attachmentIndex + 1}`,
							attachment.contentType,
						);
					}

					attachments.push(attachmentMetadata(
						attachment,
						attachmentIndex,
						includeAttachmentContent,
						binaryPropertyName,
					));
				}

				outputJson[outputPropertyName] = {
					subject: parsed.subject ?? '',
					messageId: parsed.messageId ?? '',
					inReplyTo: parsed.inReplyTo ?? '',
					references: parsed.references ?? [],
					date: parsed.date?.toISOString() ?? '',
					priority: parsed.priority ?? 'normal',
					from: addressObjectToJson(parsed.from ?? undefined),
					to: addressObjectToJson(parsed.to ?? undefined),
					cc: addressObjectToJson(parsed.cc ?? undefined),
					bcc: addressObjectToJson(parsed.bcc ?? undefined),
					replyTo: addressObjectToJson(parsed.replyTo ?? undefined),
					sender: addressObjectToJson(parsed.sender ?? undefined),
					deliveredTo: parsed.deliveredTo ?? '',
					returnPath: parsed.returnPath ?? '',
					text: parsed.text ?? '',
					textAsHtml: parsed.textAsHtml ?? '',
					html: typeof parsed.html === 'string' ? parsed.html : '',
					headers: includeHeaders ? headersToJson(parsed) : undefined,
					attachments,
				};

				returnData.push({
					json: outputJson,
					binary: Object.keys(outputBinary).length > 0 ? outputBinary : undefined,
					pairedItem: item.pairedItem ?? itemIndex,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: itemIndex,
					});
					continue;
				}

				throw error;
			}
		}

		return [returnData];
	}
}
