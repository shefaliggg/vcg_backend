const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
	throw new Error('Missing JWT_SECRET environment variable');
}

const signToken = (user) => {
	if (!user || !user._id) {
		throw new Error('signToken requires a valid user with _id');
	}

	return jwt.sign(
		{
			id: user._id.toString(),
			role: user.role,
		},
		JWT_SECRET,
		{ expiresIn: JWT_EXPIRES_IN }
	);
};

module.exports = {
	JWT_SECRET,
	JWT_EXPIRES_IN,
	signToken,
};
