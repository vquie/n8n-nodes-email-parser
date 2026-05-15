declare module 'mailparser' {
	export interface AddressEntry {
		name?: string;
		address?: string;
	}

	export interface AddressObject {
		value: AddressEntry[];
		html?: string;
		text?: string;
	}

	export interface Attachment {
		content: Buffer;
		checksum: string;
		contentDisposition?: string;
		contentType: string;
		cid?: string;
		filename?: string;
		headers: Map<string, unknown>;
		related?: boolean;
		size: number;
	}

	export interface ParsedMail {
		attachments: Attachment[];
		bcc?: AddressObject;
		cc?: AddressObject;
		date?: Date;
		deliveredTo?: string;
		from?: AddressObject;
		headers: Map<string, unknown>;
		html?: string | false;
		inReplyTo?: string;
		messageId?: string;
		priority?: string;
		references?: string[] | string;
		replyTo?: AddressObject;
		returnPath?: string;
		sender?: AddressObject;
		subject?: string;
		text?: string;
		textAsHtml?: string;
		to?: AddressObject;
	}

	export function simpleParser(input: Buffer | string): Promise<ParsedMail>;
}
