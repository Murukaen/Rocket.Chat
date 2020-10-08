import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Random } from 'meteor/random';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import moment from 'moment';

import { hasPermission } from '../../../authorization';
import { metrics } from '../../../metrics';
import { settings } from '../../../settings';
import { Notifications } from '../../../notifications';
import { messageProperties } from '../../../ui-utils';
import { Users, Messages } from '../../../models';
import { sendMessage } from '../functions';
import { RateLimiter } from '../lib';
import { canSendMessage } from '../../../authorization/server';
import { SystemLogger } from '../../../logger/server';

import { makeVerify } from '../../../typingdna/apiWrapper';

export function executeSendMessage(uid, message) {
	if (message.tshow && !message.tmid) {
		throw new Meteor.Error('invalid-params', 'tshow provided but missing tmid', {
			method: 'sendMessage',
		});
	}

	if (message.tmid && !settings.get('Threads_enabled')) {
		throw new Meteor.Error('error-not-allowed', 'not-allowed', {
			method: 'sendMessage',
		});
	}

	if (message.ts) {
		const tsDiff = Math.abs(moment(message.ts).diff());
		if (tsDiff > 60000) {
			throw new Meteor.Error('error-message-ts-out-of-sync', 'Message timestamp is out of sync', {
				method: 'sendMessage',
				message_ts: message.ts,
				server_ts: new Date().getTime(),
			});
		} else if (tsDiff > 10000) {
			message.ts = new Date();
		}
	} else {
		message.ts = new Date();
	}

	if (message.msg) {
		const adjustedMessage = messageProperties.messageWithoutEmojiShortnames(message.msg);

		if (messageProperties.length(adjustedMessage) > settings.get('Message_MaxAllowedSize')) {
			throw new Meteor.Error('error-message-size-exceeded', 'Message size exceeds Message_MaxAllowedSize', {
				method: 'sendMessage',
			});
		}
	}

	const user = Users.findOneById(uid, {
		fields: {
			username: 1,
			type: 1,
		},
	});
	let { rid } = message;

	// do not allow nested threads
	if (message.tmid) {
		const parentMessage = Messages.findOneById(message.tmid);
		message.tmid = parentMessage.tmid || message.tmid;
		rid = parentMessage.rid;
	}

	if (!rid) {
		throw new Error('The \'rid\' property on the message object is missing.');
	}

	try {
		console.log('sendMessage');
		makeVerify('test1@typingdna.com', '88,201,299,0.3478,1.8752,0.1538,1.0096,104,195,16,105,3,1,1,3,3,1,2,3,9,0,3,3,0,6,8,1,0,1,2,8,1,0,5,0,1,0,14,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.3214,0.9487,0.4923,0.7658,0.5009,0.6974,0.5795,1.453,0.7495,1,1.241,0.8376,1,0.7718,0.7941,0.9436,1,1.8462,1.1513,0.8404,0.7333,1,1.6031,1,1.1231,1,0.8347,1,1,1.9949,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1.2147,0.9231,1.3846,1.125,1.0064,1,0.875,1.109,0.969,1,1.2019,1.0064,1,0.9712,1.018,1.0769,1,0.7596,1.3077,0.8966,0.8462,1,1.1615,1,0.9327,1,1.011,1,1,0.9615,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.9761,0.6359,0.5333,0.6667,0.8718,0.5744,0.6923,0.7846,0.7379,1,1.5299,0.6957,1,0.6179,0.8726,0.8256,1,1,0.9897,0.622,0.9487,1,1.0123,1,0.9487,1,1.5072,1,1,1.4171,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1.6758,1,1,0.2841,0.2101,1,0.3714,1.41,0.5591,1,0.9379,0.2219,1,0.396,0.6046,1,1,1,0.3,0.3327,1,1,1.1546,1,1,1,0.3567,1,1,1.3905,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.6462,1,1,1.6226,0.6947,1,0.1875,1.5765,1.3629,1,2.9699,0.9469,1,0.9503,1.1338,1,1,1,1.5,0.5113,1,1,0.8124,1,1,1,0.6298,1,1,0.25,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.2028,1,1,0.4088,0.3122,1,0.1619,0.4637,0.5077,1,1.6182,0.1059,1,0.2992,0.1593,1,1,1,1,0.2844,1,1,1.2396,1,1,1,1.2234,1,1,0.4454,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,3.1,0,-1,88,0,4,111,18,0,-1,-1,14,105,10,2,80,7,2,31,30,1,0,0,1,1,1,902248182,11,1,0,0,0,1,1536,864,2,0,85,0,2642856272');
		const room = canSendMessage(rid, { uid, username: user.username, type: user.type });

		metrics.messagesSent.inc(); // TODO This line needs to be moved to it's proper place. See the comments on: https://github.com/RocketChat/Rocket.Chat/pull/5736
		return sendMessage(user, message, room, false);
	} catch (error) {
		SystemLogger.error('Error sending message:', error);

		const errorMessage = typeof error === 'string' ? error : error.error || error.message;
		Notifications.notifyUser(uid, 'message', {
			_id: Random.id(),
			rid: message.rid,
			ts: new Date(),
			msg: TAPi18n.__(errorMessage, {}, user.language),
		});

		if (typeof error === 'string') {
			throw new Error(error);
		}

		throw error;
	}
}

Meteor.methods({
	sendMessage(message) {
		check(message, Object);

		const uid = Meteor.userId();
		if (!uid) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', {
				method: 'sendMessage',
			});
		}

		try {
			return executeSendMessage(uid, message);
		} catch (error) {
			if ((error.error || error.message) === 'error-not-allowed') {
				throw new Meteor.Error(error.error || error.message, error.reason, {
					method: 'sendMessage',
				});
			}
		}
	},
});
// Limit a user, who does not have the "bot" role, to sending 5 msgs/second
RateLimiter.limitMethod('sendMessage', 5, 1000, {
	userId(userId) {
		return !hasPermission(userId, 'send-many-messages');
	},
});
