from app.main import translate_http_detail, validation_message


def test_string_length_validation_is_hungarian_and_uses_field_label():
    assert validation_message(
        "title",
        "String should have at most 180 characters",
        "string_too_long",
        {"max_length": 180},
    ) == "A(z) név legfeljebb 180 karakter hosszú lehet."


def test_known_model_validation_is_hungarian():
    assert validation_message(
        "request",
        "Value error, buy_now_price must be greater than starting_price.",
        "value_error",
        {},
    ) == "A villámárnak nagyobbnak kell lennie a kezdőárnál."


def test_unknown_validation_does_not_leak_english_message():
    assert validation_message(
        "category",
        "Input should be a valid string",
        "string_type",
        {},
    ) == "A(z) kategória mező értéke nem megfelelő."


def test_known_http_error_is_translated_to_hungarian():
    assert translate_http_detail("Auction not found") == "Az aukció nem található."


def test_invalid_status_transition_does_not_leak_internal_statuses():
    assert translate_http_detail(
        "Invalid auction status transition: active -> draft"
    ) == "Ez az aukcióállapot-váltás nem engedélyezett."


def test_invalid_email_has_specific_hungarian_message():
    assert validation_message(
        "email",
        "Value error, value is not a valid email address",
        "value_error",
        {},
    ) == "Adj meg érvényes e-mail-címet."
